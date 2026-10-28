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
    return new HomePager({ cursor: null, page_size: 20 })
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
    return new SearchPager(query)
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

    // Legacy VOD links resolve to a new-id URL, which is what the recommendations list uses
    videoDetails.getContentRecommendations = function() {
		return source.getContentRecommendations(videoDetails.url);
	};

    return videoDetails;
}
source.getUserSubscriptions = function () {
    // followed-page returns 20 per page against 5 for followed; followed is kept in case kick.com changes one of them
    let lastError
    for (const endpoint of ['followed-page', 'followed']) {
        try {
            const urls = getFollowedChannelUrls(endpoint)
            if (lastError) {
                log(`Subscription import: fell back to ${endpoint}, got ${urls.length} channels`)
            }
            return urls
        } catch (error) {
            if (error instanceof CaptchaRequiredException) {
                throw error
            }
            log(`Subscription import: ${endpoint} failed: ${error.message}`)
            lastError = error
        }
    }
    throw lastError
}

function getFollowedChannelUrls(endpoint) {
    const urls = []
    let cursor = 0
    do {
        /** @type {import("./types.d.ts").FollowedChannelResponse} */
        const j = httpGET({ url: `https://kick.com/api/v2/channels/${endpoint}?cursor=${encodeURIComponent(cursor)}`, useAuthenticated: true })
        urls.push(...j.channels.map((c) => BASE_URL + c.channel_slug))
        cursor = j.nextCursor
    } while (cursor)

    return urls
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
    // the first path segment, so channel tabs such as /about and /videos resolve to their channel
    const match = url.match(/kick\.com\/([a-zA-Z0-9-_]+)/);
    if (!match) {
        throw new ScriptException('Not a Kick URL: ' + url);
    }
    return match[1];
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
    let id = url.match(/\/videos\/([a-zA-Z0-9-_]+)/)[1]

    // kick.com links carry the new UUIDv7 VOD id. Legacy uuids go through the v1 video API only to get it,
    // since its thumbnail is null or an S3 link that expires after 5 minutes
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7/i.test(id)) {
        /** @type {import("./types.d.ts").VideoResponse}*/
        const j = callUrl(`https://kick.com/api/v1/video/${id}`)
        id = j.livestream.vod_id
    }

    /** @type {import("./types.d.ts").ChannelResponse} */
    const channel = callUrl(`https://kick.com/api/v1/channels/${extractUsername(url)}`)
    /** @type {import("./types.d.ts").WebVideoResponse} */
    const res = callUrl(`https://web.kick.com/api/v1/channels/${channel.id}/videos/${id}`)

    return webVideoToPlatformVideoDetails(res.data, channel)
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
        // the endpoint ignores `page`; kick.com pages with `after` set to the previous next_cursor
        const after = context.cursor ? `&after=${encodeURIComponent(context.cursor)}` : ''
        const json = httpGET({
            url: `https://web.kick.com/api/v1/livestreams?limit=${context.page_size}&sort=featured_home&language=${LANG}${after}`
        })

        const results = (json?.data?.livestreams ?? json?.data ?? []).map((s) => streamToPlatformVideo(s))
        const nextCursor = json?.data?.pagination?.next_cursor

        super(results, !!nextCursor, { ...context, cursor: nextCursor })
    }

    nextPage() {
        return new HomePager(this.context)
    }
}
class SearchPager extends VideoPager {
    /**
     * Search livestreams
     * @param {string} query
     */
    constructor(query) {
        /** @type {import("./types.d.ts").SearchResponse} */
        const j = callUrl(`https://search.kick.com/api/v1/search/enriched?query=${encodeURIComponent(query)}`)

        // kick.com returns at most 10 livestreams and has no paging for them
        const results = j.data.livestreams.map((s) => streamToPlatformVideo(s))

        super(results, false, { query })
    }
}
class SearchPagerChannels extends ChannelPager {
    /**
     * Search channels
     * @param {string} query
     */
    constructor(query) {
        /** @type {import("./types.d.ts").SearchResponse} */
        const j = callUrl(`https://search.kick.com/api/v1/search/enriched?query=${encodeURIComponent(query)}`)

        const results = j.data.channels.map((u) => searchChannelToPlatformChannel(u))

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

        // kick.com hands out the Pusher app key per connection; the old hardcoded key was rotated out
        const clientId = 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
        const connection = http.POST(
            `https://web.kick.com/api/v1/realtime/channels/${resp.id}/chat/connection`,
            JSON.stringify({ client: { id: clientId, type: 'web' }, capabilities: { accepted_providers: [{ provider: 'pusher' }] } }),
            { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': getUserAgent() },
            false
        )
        if (!connection.isOk) {
            throw new ScriptException('Chat connection failed with code [' + connection.code + ']')
        }
        /** @type {import("./types.d.ts").RealtimeConnectionResponse} */
        const realtime = JSON.parse(connection.body)
        const { app_key, cluster } = realtime.data.connections[0].credentials

        let socket = http.socket(
            `wss://ws-${cluster}.pusher.com/app/${app_key}?protocol=7&client=js&version=7.6.0&flash=false`,
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
        /** @type {import("./types.d.ts").WebVideoListResponse} */
        const videos = callUrl(`https://web.kick.com/api/v1/channels/${j.id}/videos`)

        // the list includes the running stream, which is added below with its live source
        let results = videos.data
            .filter((v) => !v.is_live)
            .map((v) => webVideoToPlatformVideo(v, j))

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
    
    // livestream.thumbnail.url is null or answers 403; kick.com's player loads this one instead
    const thumbnails = [new Thumbnail(`https://web.kick.com/api/v1/channels/${j.id}/thumbnail.jpeg`, 0)];
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
        // start_time is UTC without a zone marker ("2026-10-27 19:58:02")
        uploadDate: parseInt(new Date(j.livestream.start_time.replace(' ', 'T') + 'Z').getTime() / 1000),
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
        name: c.username,
        thumbnail: c.profile_picture,
        banner: '',
        subscribers: c.follower_count,
        description: '',
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
    const channelProfilePic = s?.channel?.user?.profilepic ?? s?.channel?.profile_pic ?? s?.channel?.profile_picture;
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
 * Convert a channel VOD from the web API to a PlatformVideo
 * @param { import("./types.d.ts").WebVideo } v
 * @param { import("./types.d.ts").ChannelResponse } channel
 * @returns { PlatformVideo }
 */
function webVideoToPlatformVideo(v, channel) {
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, v.id, config.id),
        name: v.title,
        thumbnails: new Thumbnails([new Thumbnail(v.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, channel.user_id.toString(), config.id, PLATFORM_CLAIMTYPE),
            channel.user.username,
            BASE_URL + channel.slug,
            channel.user.profile_pic
        ),
        uploadDate: parseInt(new Date(v.start_time).getTime() / 1000),
        duration: v.duration,
        viewCount: v.viewer_count,
        url: `${BASE_URL}${channel.slug}/videos/${v.id}`,
        isLive: false,
    })
}
/**
 * Convert a VOD from the web API to a PlatformVideoDetails
 * @param { import("./types.d.ts").WebVideo } v
 * @param { import("./types.d.ts").ChannelResponse } channel
 * @returns { PlatformVideoDetails }
 */
function webVideoToPlatformVideoDetails(v, channel) {
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, v.id, config.id),
        name: v.title,
        thumbnails: new Thumbnails([new Thumbnail(v.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, channel.user_id.toString(), config.id, PLATFORM_CLAIMTYPE),
            channel.user.username,
            BASE_URL + channel.slug,
            channel.user.profile_pic
        ),
        uploadDate: parseInt(new Date(v.start_time).getTime() / 1000),
        duration: v.duration,
        viewCount: v.viewer_count,
        url: `${BASE_URL}${channel.slug}/videos/${v.id}`,
        isLive: false,
        description: channel.user.bio,
        video: new VideoSourceDescriptor([vodHlsSource(v.recording_url, v.duration)]),
    })
}
/**
 * @param {string} url
 * @param {number} duration in seconds
 * @returns {HLSSource}
 */
function vodHlsSource(url, duration) {
    return new HLSSource({
        name: 'hls',
        duration: duration,
        url: url,
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
