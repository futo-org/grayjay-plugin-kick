//* Constants
const BASE_URL = 'https://kick.com/'
const LANG = 'en'
const PLATFORM = 'kick'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
const PLATFORM_CLAIMTYPE = 16;

var config = {}

//* Source
source.enable = function (conf) {}
source.getHome = function () {
    return new HomePager({ page: 1, page_size: 20 })
}
source.searchSuggestions = function (query) {
    const gql = { searches: [{ preset: 'channel_search', q: query }] }

    /** @type {import("./types.d.ts").MultiSearchResponse} */
    const result = http.POST('https://search.kick.com/multi_search', JSON.stringify(gql), {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        Host: 'search.kick.com',
        Origin: 'https://kick.com',
        Referer: 'https://kick.com/',
        'X-TYPESENSE-API-KEY': 'nXIMW0iEN6sMujFYjFuhdrSwVow3pDQu',
    })

    const json = JSON.parse(result.body)


    if (!('results' in json) || json.results.length === 0) {
        return []
    }

    return json.results[0].hits.map((h) => h.document.username)
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
    const login = url.split('/').pop()

    /** @type {import("./types.d.ts").ChannelResponse} */
    const j = callUrl(`https://kick.com/api/v1/channels/${login}`)

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, j.id.toString(), config.id, PLATFORM_CLAIMTYPE),
        name: j.user.username,
        thumbnail: j.user.profile_pic,
        banner: j.banner_image?.url,
        subscribers: j.followersCount,
        description: j.user.bio,
        url: BASE_URL + j.slug,
        links: j.ascending_links.filter((l) => l.link !== '').map((l) => l.link),
    })
}
source.getChannelContents = function (url) {
    return new ChannelVideoPager({ url, page_size: 20, cursor: null })
}

source.getChannelTemplateByClaimMap = () => {
    return {
        //Kick
        16: {
            0: URL_BASE + "{{CLAIMVALUE}}"
        }
    };
};

source.isContentDetailsUrl = function (url) {
    // https://kick.com/user or https://kick.com/video/uuiduuid-uuid-uuid-uuid-uuiduuiduuid
    return /kick\.com\/[a-zA-Z0-9-_]+\/?/.test(url) || /kick\.com\/video\/[a-zA-Z0-9-_]+\/?/.test(url)
}
source.getContentDetails = function (url) {
    if (url.includes('/video/')) {
        return getSavedVideo(url)
    } else {
        return getLiveVideo(url)
    }
}
source.getUserSubscriptions = function () {
    /** @type {import("./types.d.ts").FollowedChannelResponse} */
    const j = callUrl('https://kick.com/api/v2/channels/followed?cursor=0', true)

    return j.channels.map((c) => BASE_URL + c.channel_slug)
}
source.getComments = function (url) {
    return new CommentPager([], false, {}) //Not implemented
}
source.getSubComments = function (comment) {
    return new CommentPager([], false, {}) //Not implemented
}
source.getLiveChatWindow = function(url) {
    const login = url.split('/').pop()
    return {
        url: "https://kick.com/" + login + "/chatroom",
        removeElements: [ "#chatroom-top"]
    };
}
source.getLiveEvents = function (url) {
    const login = url.split('/').pop()

    return new LiveEventPagerHelper(login)
}
//* Internals
/**
 * Gets the requested url and returns the response body either as a string or as a parsed json object
 * @param {string} url the url to call
 * @param {boolean} use_authenticated if true, will use the authenticated headers
 * @param {boolean} parse if true, will parse the response as json and check for errors
 * @returns {string | Object} the response body as a string or the parsed json object
 * @throws {ScriptException}
 */
function callUrl(url, use_authenticated = false, parse_response = true) {
    // log("Integrity: " + INTEGRITY)
    const resp = http.GET(
        url,
        {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            DNT: '1',
            Host: 'kick.com',
            Referer: 'kick.com',
        },
        use_authenticated
    )

    if (!resp.isOk) {
        throw new ScriptException(resp.statusMessage)
    }

    if (parse_response) {
        const json = JSON.parse(resp.body)
        if (json.errors) {
            throw new ScriptException(json.errors[0].message)
        }
        return json
    }

    return resp.body
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
    const login = url.split('/').pop()

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
        const json = callUrl(`https://kick.com/stream/livestreams/en?page=${context.page}&limit=${context.page_size}&sort=featured`)

        const results = json.data.map((s) => streamToPlatformVideo(s))

        super(results, json.next_page_url !== null, context)
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
     * @param {number} channel_id
     * @param {number} chatroom_id
     * @param {LiveEventEmojis[]} emojis
     * @param {LiveEventComment[]} events
     * @param {number} lastFetch
     */
    constructor(channel_login) {
        super([], true)
        const me = this

        /** @type {import("./types.d.ts").ChannelResponse} */
        const resp = callUrl(`https://kick.com/api/v2/channels/${channel_login}`)
    
        /** @type {import("./types.d.ts").PrepopulateChatResponse}*/
        const j = callUrl(`https://kick.com/api/v2/channels/${resp.id}/messages`)
    
        const parsed = j.data.messages.map((m) => parseMessage(m))
        const flat_map_emojis = parsed.flatMap((m) => m.emojis).filter((e) => e !== {})
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
        const login = context.url.split('/').pop()

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
    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, j.livestream.id.toString(), config.id),
        name: j.user.username,
        thumbnails: new Thumbnails([new Thumbnail(j.livestream.thumbnail.url, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, j.user_id.toString(), config.id, PLATFORM_CLAIMTYPE),
            j.user.username,
            BASE_URL + j.slug,
            j.user.profile_pic
        ),
        uploadDate: (j.created_at) ? parseInt(new Date(j.created_at).getTime() / 1000) : parseInt(new Date().getTime() / 1000),
        duration: j.livestream.duration,
        viewCount: j.livestream.viewer_count,
        url: BASE_URL + j.slug,
        isLive: true,
        description: j.user.bio,
        video: new VideoSourceDescriptor([]),
        live: new HLSSource({ name: 'live', duration: 0, url: j.playback_url }),
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
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, s.id.toString(), config.id),
        name: s.session_title,
        thumbnails: new Thumbnails([new Thumbnail(s.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, s.channel.user.id.toString(), config.id, PLATFORM_CLAIMTYPE),
            s.channel.user.username,
            BASE_URL + s.channel.slug,
            s.channel.user.profilepic
        ),
        uploadDate: parseInt(new Date(s.created_at + ' UTC').getTime() / 1000),
        duration: s.duration,
        viewCount: s.viewer_count,
        url: BASE_URL + s.channel.slug,
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
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, s.id.toString(), config.id),
        name: s.session_title,
        thumbnails: new Thumbnails([new Thumbnail(s.thumbnail.src, 0)]),
        author: new PlatformAuthorLink(new PlatformID(PLATFORM, u.id.toString(), config.id, PLATFORM_CLAIMTYPE), u.username, BASE_URL + slug, u.profile_pic),
        uploadDate: parseInt(new Date(s.created_at).getTime() / 1000),
        duration: s.duration / 1000,
        viewCount: s.views,
        url: BASE_URL + 'video/' + s.video.uuid,
        isLive: false,
    })
}
/**
 * Converts a saved video to a platform video
 * @param {import("./types.d.ts").VideoResponse} j
 * @returns {PlatformVideoDetails}
 */
function savedVideoToPlatformVideo(j) {
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
        duration: j.livestream.duration,
        viewCount: j.views,
        url: BASE_URL + 'video/' + j.uuid,
        isLive: false,
        description: j.livestream.channel.user.bio,
        video: new VideoSourceDescriptor([new HLSSource({ name: 'hls', duration: j.livestream.duration, url: j.source })]),
    })
}

console.log('LOADED')
