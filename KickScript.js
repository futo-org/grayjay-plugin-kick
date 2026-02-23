//* Constants
const BASE_URL = 'https://kick.com/'
const LANG = 'en'
const PLATFORM = 'kick'

const IS_DESKTOP = bridge.buildPlatform === "desktop";

const USER_AGENT_FALLBACK = IS_DESKTOP
    ? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.200 Mobile Safari/537.36';
    
const getUserAgent = () => bridge.authUserAgent ?? bridge.captchaUserAgent ?? USER_AGENT_FALLBACK;

const PLATFORM_CLAIMTYPE = 16;

const IMPERSONATION_TARGET = IS_DESKTOP ? 'chrome136' : 'chrome131_android';
const IS_IMPERSONATION_AVAILABLE = (typeof httpimp !== 'undefined');

let config = {}
let settings = {}

//* Source
source.enable = function (conf, setts) {
    config = conf ?? {};
    settings = setts ?? {};

    if (IS_IMPERSONATION_AVAILABLE) {
        const httpImpClient = httpimp.getDefaultClient(true);
        if (httpImpClient.setDefaultImpersonateTarget) {
            httpImpClient.setDefaultImpersonateTarget(IMPERSONATION_TARGET);
        }
    }
}
source.getHome = function () {
    return new HomePager({ page: 1, page_size: 20 })
}
source.searchSuggestions = function (query) {
    const gql = { searches: [{ preset: 'channel_search', q: query }] }

    /** @type {import("./types.d.ts").MultiSearchResponse} */
    const result = http.POST('https://search.kick.com/multi_search', JSON.stringify(gql), {
        'Content-Type': 'application/json',
        'User-Agent': getUserAgent(),
        Accept: 'application/json',
        Host: 'search.kick.com',
        Origin: 'https://kick.com',
        Referer: 'https://kick.com/',
        'X-TYPESENSE-API-KEY': 'nXIMW0iEN6sMujFYjFuhdrSwVow3pDQu',
    })

    let json;
    try {
        json = JSON.parse(result.body)
    } catch (e) {
        log('Failed to parse search suggestions response: ' + e);
        return []
    }

    return (json?.results?.[0]?.hits ?? [])
    .map((h) => h.document.username)
}
source.getSearchCapabilities = () => {
    return { types: [Type.Feed.Mixed], sorts: [], filters: [] }
}
source.search = function (query, type, order, filters) {
    return new VideoPager()
}
source.getSearchChannelContentsCapabilities = function () {
    return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] }
}
// not in Kick
source.searchChannelContents = function (channelUrl, query, type, order, filters) {
    return []
}
source.searchChannels = function (query) {
    return new SearchPagerChannels(query)
}
source.isChannelUrl = function (url) {
    return /kick\.com\/[a-zA-Z0-9-_]+\/?/.test(url)
}
source.getChannel = function (url) {
    const login = extractUsername(url)

    /** @type {import("./types.d.ts").ChannelResponse} */
    const j = callUrl(`https://kick.com/api/v1/channels/${login}`)
   
    const links = {};

    const propertMaps = {
        'instagram':  {
            urlPrefix: 'https://instagram.com/',
            displayName: 'Instagram',
        },
        'twitter':  {
            urlPrefix: 'https://x.com/',
            displayName: 'X',
        },
        'youtube':  {
            urlPrefix: 'https://youtube.com/',
            displayName: 'Youtube',
        },
        'discord':  {
            urlPrefix: 'https://discord.gg/',
            displayName: 'Discord',
        },
        'tiktok':  {
            urlPrefix: 'https://tiktok.com/@',
            displayName: 'Tiktok',
        },
        'facebook':  {
            urlPrefix: 'https://facebook.com/',
            displayName: 'Facebook',
        },
    }

    for (const key in propertMaps) {
        
        let externalUrlProperty = j?.user?.[key];
        
        if (externalUrlProperty) {

            let externalUrl = '';

            // check if it's an absolute url
            if(/^https:\/\//i.test(externalUrlProperty)) {
                externalUrl = externalUrlProperty;
            }
            else {
                externalUrl = propertMaps[key].urlPrefix + externalUrlProperty;
            }

            links[propertMaps[key].displayName] = externalUrl;
        }
    }

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, j.id.toString(), config.id, PLATFORM_CLAIMTYPE),
        name: j.user.username,
        thumbnail: j.user.profile_pic,
        banner: j.banner_image?.url,
        subscribers: j.followersCount,
        description: j.user.bio,
        url: BASE_URL + j.slug,
        links,
    })
}
source.getChannelContents = function (url, type, order, filters) {
    return new ChannelVideoPager({ url, page_size: 20, cursor: null })
}

source.getChannelTemplateByClaimMap = () => {
    return {
        //Kick
        16: {
            0: BASE_URL + "{{CLAIMVALUE}}"
        }
    };
};

source.isContentDetailsUrl = function (url) {
    // https://kick.com/user or https://kick.com/username/videos/uuid
    return /kick\.com\/[a-zA-Z0-9-_]+\/?$/.test(url) || /kick\.com\/[a-zA-Z0-9-_]+\/videos\/[a-zA-Z0-9-_]+\/?/.test(url)
}
source.getContentDetails = function (url) {

    let videoDetails;

    if (url.includes('/videos/')) {
        videoDetails = getSavedVideo(url)
    } else {
        videoDetails = getLiveVideo(url)
    }

    videoDetails.getContentRecommendations = function() {
		return source.getContentRecommendations(url);
	};

    return videoDetails;
}
source.getUserSubscriptions = function () {
    /** @type {import("./types.d.ts").FollowedChannelResponse} */
    const j = httpGET({ url: 'https://kick.com/api/v2/channels/followed?cursor=0', useAuthenticated: true })

    return j.channels.map((c) => BASE_URL + c.channel_slug)
}

source.getContentRecommendations = function (url) {

    if (url.includes('/videos/')) {
        const username = extractUsername(url);
        const channelUrl = BASE_URL + username;
        const pager = source.getChannelContents(channelUrl);

        // remove the current video
        pager.results = pager.results.filter((v) => v.url !== url);

        return pager;
    } else {
        const res = httpGET({ 
            url: 'https://web.kick.com/api/v1/livestreams/featured?language=en', 
            useAuthenticated: false, 
            parseResponse: true, 
            retries: 4, 
            headers: {
                Accept: 'application/json',
                'Accept-Language': 'en-US,en;q=0.5',
                'Alt-Used': 'web.kick.com',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                Origin: 'https://kick.com',
                Pragma: 'no-cache',
                Priority: 'u=4',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'Sec-GPC': '1',
                TE: 'trailers',
                'User-Agent': getUserAgent(),
            }
        });
        
        const results = (res?.data?.livestreams ?? [])
        ?.map((l) => streamToPlatformVideo(l))
        ?.filter((l) => l?.url != url); // remove the current video
        
        return new VideoPager(results, false);
    }
}

source.getComments = function (url) {
    return new CommentPager([], false, {}) //Not implemented
}
source.getSubComments = function (comment) {
    return new CommentPager([], false, {}) //Not implemented
}
source.getLiveChatWindow = function(url) {
    const login = extractUsername(url)
    return {
        url: "https://kick.com/popout/" + login + "/chat",
    };
}
source.getLiveEvents = function (url) {
    const login = extractUsername(url)

    return new LiveEventPagerHelper(login)
}
//* Internals
/**
 * Extracts the username from a Kick URL
 * @param {string} url - The URL to extract username from
 * @returns {string} The username
 */
function extractUsername(url) {
    // Match kick.com/username/videos/uuid
    let match = url.match(/kick\.com\/([a-zA-Z0-9-_]+)\/videos\/[a-zA-Z0-9-_]+/);
    if (match) {
        return match[1];
    }
    
    // Match kick.com/username or kick.com/username/
    match = url.match(/kick\.com\/([a-zA-Z0-9-_]+)\/?$/);
    if (match) {
        return match[1];
    }
    
    // If no match, fallback to the old method as safety
    return url.split('/').pop();
}

/**
 * Simple wrapper for making GET requests to Kick API endpoints
 * @param {string} url - The URL to fetch
 * @returns {Object} The parsed JSON response
 * @throws {ScriptException} If the request fails or returns an error
 */
function callUrl(url) {
    return httpGET({ url })
}

/**
 * Gets the requested url and returns the response body either as a string or as a parsed json object.
 * Cascades through http -> httpimp based on settings.
 * @param {Object} options - The options object
 * @param {string} options.url - The URL to call
 * @param {boolean} [options.useAuthenticated=false] - If true, will use the authenticated headers
 * @param {boolean} [options.parseResponse=true] - If true, will parse the response as json and check for errors
 * @param {number} [options.retries=3] - Number of retry attempts
 * @param {Object} [options.headers=null] - Custom headers to use for the request
 * @returns {string | Object} the response body as a string or the parsed json object
 * @throws {ScriptException}
 */
function httpGET(options) {
    const {
        url,
        useAuthenticated = false,
        parseResponse = true,
        retries = 3,
        headers = null
    } = options;

    const baseHeaders = headers ?? {
        Accept: 'application/json',
        DNT: '1',
        Referer: 'https://kick.com/',
    }
    // Only set User-Agent for standard http; httpimp sets its own to match TLS fingerprint
    const httpHeaders = { 'User-Agent': getUserAgent(), ...baseHeaders }

    function parseBody(resp) {
        if (parseResponse) {
            const json = JSON.parse(resp.body)
            if (json.errors) {
                throw new ScriptException(json.errors[0].message)
            }
            return json
        }
        return resp.body
    }

    function tryClient(client, label, attempts, reqHeaders) {
        let lastError;
        let captchaError = null;
        while (attempts > 0) {
            try {
                const resp = client.GET(url, reqHeaders, useAuthenticated)
                if (!resp.isOk) {
                    throwIfCaptcha(resp);
                    throw new ScriptException("Request [" + url + "] failed with code [" + resp.code + "]")
                }
                verbose("[" + label + "] OK: " + url);
                return parseBody(resp);
            } catch (error) {
                if (error instanceof CaptchaRequiredException) {
                    verbose("[" + label + "] Captcha: " + url);
                    captchaError = error;
                } else {
                    lastError = error;
                }
                attempts--;
                if (attempts > 0) {
                    verbose("[" + label + "] Retry (" + attempts + " left): " + url);
                }
            }
        }
        verbose("[" + label + "] Failed: " + url);
        if (captchaError) throw captchaError;
        throw lastError;
    }

    const useHttp = settings.useHttp !== false;
    const useRetries = settings.useRequestRetries !== false;
    const useImp = settings.useHttpImpersonation !== false && IS_IMPERSONATION_AVAILABLE;

    let captchaError = null;
    let lastError = null;
    // 1. Try http with retries
    if (useHttp) {
        try {
            return tryClient(http, 'http', useRetries ? retries + 1 : 1, httpHeaders);
        } catch (e) {
            if (e instanceof CaptchaRequiredException) captchaError = e;
            else lastError = e;
        }
    }
    // 2. Try httpimp if available
    if (useImp) {
        try {
            return tryClient(httpimp, 'httpimp', 1, baseHeaders);
        } catch (e) {
            if (e instanceof CaptchaRequiredException) captchaError = e;
            else lastError = e;
        }
    }
    if (captchaError) throw captchaError;
    throw lastError || new ScriptException("All request methods failed for: " + url);
}

/**
 * Returns a saved video
 * @param {string} url
 * @returns {PlatformVideoDetails}
 */
function getSavedVideo(url) {
    const id = url.split('/').pop()

    /** @type {import("./types.d.ts").VideoResponse}*/
    const j = callUrl(`https://kick.com/api/v1/video/${id}`)

    return savedVideoToPlatformVideo(j)
}
/**
 * Returns a live video
 * @param {string} url
 * @param {boolean} throw_if_not_live
 * @returns {PlatformVideoDetails}
 */
function getLiveVideo(url, throw_if_not_live = true) {
    const login = extractUsername(url)

    /** @type {import("./types.d.ts").ChannelResponse} */
    const j = callUrl(`https://kick.com/api/v2/channels/${login}`)

    if (j.livestream === null) {
        if (throw_if_not_live) {
            throw new UnavailableException('Channel is not live')
        }
        return null
    }

    return liveVideoToPlatformVideo(j)
}
//* Pagers
class HomePager extends VideoPager {
    /**
     * @param {import("./types.d.ts").HomeContext} context
     */
    constructor(context) {
        /** @type {import("./types.d.ts").FeaturedStreamResponse} */
        const json = httpGET({
            url: `https://web.kick.com/api/v1/livestreams?page=${context.page}&limit=${context.page_size}&sort=featured_home&language=${LANG}`
        })

        const results = (json?.data?.livestreams ?? json?.data ?? []).map((s) => streamToPlatformVideo(s))
        const hasMore = !!(json?.data?.pagination?.next_cursor ?? json?.next_page_url)

        super(results, hasMore, context)
    }

    nextPage() {
        this.context.page++
        return new HomePager(this.context)
    }
}
class SearchPagerChannels extends ChannelPager {
    /**
     * Search channels
     * @param {string} query
     */
    constructor(query) {
        /** @type {import("./types.d.ts").SearchResponse} */
        const j = callUrl(`https://kick.com/api/search?searched_word=${query}`)

        const results = j.channels.map((u) => searchChannelToPlatformChannel(u))

        super(results, false, { query })
    }
}
/**
 *
 * @param {string | Object} msg
 * @returns {{message: LiveEventComment, emojis: {[key: string]: string}}}
 */
function parseMessage(msg) {
    if (typeof msg === 'string') {
        msg = JSON.parse(msg)
    }

    /** @type {import("./types.d.ts").ChatroomMessage} */
    const data = msg
    // example with emotes: "Yes [emote:37233:PogU]" or "Yes [emote:37233:]"
    let content = data.content

    let emojis = {}

    // replace emotes with __https://files.kick.com/emotes/{id}/fullsize__
    const replaced = content.replace(/\[emote:(\d+)(?::(\w*))?\]/g, (match, id, name) => {
        const url = `https://files.kick.com/emotes/${id}/fullsize`
        emojis['emoji_' + id] = url
        return `__emoji_${id}__`
    })

    const lec = new LiveEventComment(data.sender.username, replaced, '', data.sender.identity.color)

    return { message: lec, emojis }
}
class LiveEventPagerHelper extends LiveEventPager {
    /**
     * @param {string} channel_login
     */
    constructor(channel_login) {
        super([], true)
        const me = this

        /** @type {import("./types.d.ts").ChannelResponse} */
        const resp = callUrl(`https://kick.com/api/v2/channels/${channel_login}`)
    
        /** @type {import("./types.d.ts").PrepopulateChatResponse}*/
        const j = callUrl(`https://kick.com/api/v2/channels/${resp.id}/messages`)
    
        const parsed = (j?.data?.messages ?? []).map((m) => parseMessage(m))
        const flat_map_emojis = parsed.flatMap((m) => m.emojis).filter((e) => e != {})
        let emojis = {}
        for (const emoji of flat_map_emojis) {
            emojis = { ...emojis, ...emoji }
        }
        this.emojis = emojis
        this.events = parsed.map((m) => m.message)
        this.lastFetch = new Date().getTime()

        let socket = http.socket(
            'wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false',
            {},
            false
        )
        socket.connect({
            open() {
                socket.send(`{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.${resp.chatroom.id}.v2"}}`)
            },
            message(msg) {
                if ((new Date().getTime() - me.lastFetch) / 1000 > 10) socket.close()
                // {"event":"App\\Events\\ChatMessageEvent","data":"{\"id\":\"acfc6ccc-c39b-4929-9911-e49867325b76\",\"chatroom_id\":32806,\"content\":\"[emote:37226:KEKW]\",\"type\":\"message\",\"created_at\":\"2023-07-14T21:10:02+00:00\",\"sender\":{\"id\":228242,\"username\":\"izzywrotethis\",\"slug\":\"izzywrotethis\",\"identity\":{\"color\":\"#F2708A\",\"badges\":[{\"type\":\"moderator\",\"text\":\"Moderator\"},{\"type\":\"subscriber\",\"text\":\"Subscriber\",\"count\":3}]}}}","channel":"chatrooms.32806.v2"}
                /** @type {import("./types.d.ts").ChatroomMessageResponse} */
                const parsed = JSON.parse(msg)
                if (parsed.event === 'App\\Events\\ChatMessageEvent') {
                    const { message, emojis } = parseMessage(parsed.data)
                    me.events.push(message)
                    me.emojis = { ...me.emojis, ...emojis }
                }
            },
        })
    }
    nextPage() {
        this.lastFetch = new Date().getTime()
        this.results = [new LiveEventEmojis(this.emojis), ...this.events]
        this.emojis = {}
        this.events = []
        return this
    }
}
class ChannelVideoPager extends VideoPager {
    /**
     * @param {import("./types.d.ts").URLContext} context the context
     */
    constructor(context) {
        const login = extractUsername(context.url);
        /** @type {import("./types.d.ts").ChannelResponse} */
        const j = callUrl(`https://kick.com/api/v1/channels/${login}`)

        let results = j.previous_livestreams.map((v) => previousLivestreamToPlatformVideo(v, j.user, j.slug))

        // no need for first time checks since kick does not paginate vods
        const current_live = getLiveVideo(context.url, false)
        if (current_live) results.unshift(current_live)

        super(results, false, context)
    }
}
//* Converters
/**
 * Converts a livestream to a PlatformVideo
 * @param {import("./types.d.ts").ChannelResponse} j
 * @returns {PlatformVideoDetails}
 */
function liveVideoToPlatformVideo(j) {
    
    const thumbnails = j?.livestream?.thumbnail?.url ? [new Thumbnail(j.livestream.thumbnail.url, 0)] : [];
    const streamTitle = j?.livestream?.session_title ?? j.user.username;

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, j.livestream.id.toString(), config.id),
        name: streamTitle,
        thumbnails: new Thumbnails(thumbnails),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, j.user_id.toString(), config.id, PLATFORM_CLAIMTYPE),
            j.user.username,
            BASE_URL + j.slug,
            j.user.profile_pic
        ),
        uploadDate: (j.created_at) ? parseInt(new Date(j.created_at).getTime() / 1000) : parseInt(new Date().getTime() / 1000),
        duration: j?.livestream?.duration ?? 0 ,
        viewCount: j?.livestream?.viewer_count ?? 0,
        url: BASE_URL + j.slug,
        isLive: true,
        description: j?.user?.bio ?? '',
        video: new VideoSourceDescriptor([]),
        live: new HLSSource({
            name: 'live',
            duration: 0,
            url: j.playback_url,
            ...(settings.useStreamImpersonation !== false ? {
                requestModifier: {
                    options: {
                        applyAuthClient: "",
                        applyCookieClient: "",
                        applyOtherHeaders: false,
                        impersonateTarget: IMPERSONATION_TARGET
                    }
                }
            } : {})
        }),
    })
}
/**
 * Convert a search channel to a platform channel
 * @param {import("./types.d.ts").SearchChannel} c
 * @returns { PlatformChannel }
 */
function searchChannelToPlatformChannel(c) {
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, c.id.toString(), config.id, PLATFORM_CLAIMTYPE),
        name: c.user.username,
        thumbnail: c.user.profilePic,
        banner: '',
        subscribers: c.followersCount,
        description: c.user.bio,
        url: BASE_URL + c.slug,
        links: [],
    })
}
/**
 * Convert a Live Kick to a PlatformVideo
 * @param { import("./types.d.ts").Stream } s
 * @returns { PlatformVideo }
 */
function streamToPlatformVideo(s) {
    
    const channelId = s?.channel?.user?.id?.toString() ?? s?.channel?.id?.toString();
    const channelSlug =  s?.channel?.user?.slug ?? s?.channel?.slug;
    const channelUsername = s?.channel?.user?.username ?? s?.channel?.username;
    const channelProfilePic = s?.channel?.user?.profilepic ?? s?.channel?.profile_pic;
    const name = s?.session_title ?? s.title ?? '';

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, s.id.toString(), config.id),
        name,
        thumbnails: new Thumbnails([new Thumbnail(s.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, channelId, config.id, PLATFORM_CLAIMTYPE),
            channelUsername,
            BASE_URL + channelSlug,
            channelProfilePic
        ),
        uploadDate: parseInt(new Date(s.start_time ?? s.created_at ?? new Date().toISOString()).getTime() / 1000),
        duration: s.duration ?? 0,
        viewCount: s.viewer_count,
        url: BASE_URL + channelSlug,
        isLive: true,
    })
}
/**
 * Convert a previous livestream to a PlatformVideo
 * @param { import("./types.d.ts").PreviousLivestream } s
 * @param { import("./types.d.ts").User } u
 * @param { string } slug
 * @returns { PlatformVideo }
 */
function previousLivestreamToPlatformVideo(s, u, slug) {
    const username = u.username ?? slug;
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, s.id.toString(), config.id),
        name: s.session_title,
        thumbnails: new Thumbnails([new Thumbnail(s.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(
                PLATFORM, 
                u.id.toString(), 
                config.id, 
                PLATFORM_CLAIMTYPE
            ), u.username, 
            BASE_URL + slug, 
            u.profile_pic
        ),
        uploadDate: parseInt(new Date(s.created_at).getTime() / 1000),
        duration: s.duration / 1000,
        viewCount: s.views,
        url: `https://kick.com/${username}/videos/${s.video.uuid}`,
        isLive: false,
    })
}
/**
 * Converts a saved video to a platform video
 * @param {import("./types.d.ts").VideoResponse} j
 * @returns {PlatformVideoDetails}
 */
function savedVideoToPlatformVideo(j) {
    const duration = j.livestream?.duration ? j.livestream.duration / 1000 : 0;
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, j.id.toString(), config.id),
        name: j.livestream.session_title,
        thumbnails: new Thumbnails([new Thumbnail(j.livestream.thumbnail)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, j.livestream.channel.user_id.toString(), config.id, PLATFORM_CLAIMTYPE),
            j.livestream.channel.user.username,
            BASE_URL + j.livestream.channel.slug,
            j.livestream.channel.user.profilepic
        ),
        uploadDate: parseInt(new Date(j.created_at).getTime() / 1000),
        duration: duration,
        viewCount: j.views,
        url: `${BASE_URL}${j.livestream.channel.slug}/videos/${j.uuid}`,
        isLive: false,
        description: j.livestream.channel.user.bio,
        video: new VideoSourceDescriptor([new HLSSource({
            name: 'hls',
            duration: duration,
            url: j.source,
            ...(settings.useStreamImpersonation !== false ? {
                requestModifier: {
                    options: {
                        applyAuthClient: "",
                        applyCookieClient: "",
                        applyOtherHeaders: false,
                        impersonateTarget: IMPERSONATION_TARGET
                    }
                }
            } : {})
        })]),
    })
}

function throwIfCaptcha(resp) {
    if (resp?.body && !resp?.isOk) {
        if (/Just a moment\.\.\./i.test(resp.body) || resp.body.includes('/cdn-cgi/challenge-platform')) {
            throw new CaptchaRequiredException(resp.url, resp.body);
        }
    }
    return true;
}

function verbose(msg) {
    if (settings.verboseNotifications) {
        bridge.toast(msg);
    }
    log(msg);
}

log('LOADED')
