export type HomeContext = {
    page: number
    page_size: number
}

export type URLContext = {
    url: string
    page: number
    page_size: number
}

export type LiveEventsContext = {
    login: string
    channel_id: number
    chatroom_id: number
    emojis: { [key: string]: string }
    events: LiveEvent[]
    lastFetch: number
}

export type Category = {
    category: {
        icon: string
        id: number
        name: string
        slug: string
    }
    category_id: number
    deleted_at?: string
    description?: string
    id: number
    name: string
    slug: string
    tags: string[]
    viewers: number
    banner: {
        responsive: string
        url: string
    }
}

type User = {
    agreed_to_terms: boolean
    bio: string
    city?: string
    country?: string
    discord?: string
    email_verified_at?: string
    facebook?: string
    id: number
    instagram?: string
    profile_pic: string
    state?: string
    tiktok?: string
    twitter?: string
    username: string
    youtube?: string
}

export type Channel = {
    can_host: boolean
    id: number
    is_banned: boolean
    name_updated_at?: string
    playback_url: string
    slug: string
    subscription_enabled: boolean
    user: User
    user_id: number
    vod_enabled: boolean
}

export type Stream = {
    categories: Category[]
    channel: Channel
    channel_id: number
    created_at: string
    duration: number
    id: number
    is_live: boolean
    is_mature: boolean
    language: string
    order: number
    risk_level_id?: number
    session_title: string
    slug: string
    source?: string
    thumbnail: {
        src: string
        srcset: string
    }
    twitch_channel?: number
    viewer_count: number
    viewers: number
}

type HighlightObject = {
    username: {
        matched_tokens: string[]
        snippet: string
    }
}

export type SearchResult = {
    document: {
        followers_count: number
        id: string
        is_banned: boolean
        is_live: boolean
        slug: string
        username: string
        verified: boolean
    }
    highlight: HighlightObject
    highlights: HighlightObject[]
    text_match: number
    text_match_info: {
        best_field_score: string
        best_field_weight: number
        fields_matched: number
        score: string
        tokens_matched: number
    }
}

export type ResultsObject = {
    facet_counts: any[]
    found: number
    hits: SearchResult[]
    out_of: number
    page: number
    request_params: {
        collection_name: 'channel'
        per_page: number
        q: string
    }
    search_cutoff: boolean
    search_time_ms: number
}

export type MultiSearchResponse = {
    results: ResultsObject[]
}

type ListWrapper<T> = {
    current_page: number
    data: T[]
    first_page_url: string
    from: number
    next_page_url: string
    path: string
    per_page: number
    prev_page_url: string
    to: number
}

export type FeaturedStreamResponse = ListWrapper<Stream>

type Badge = {
    id: number
    channel_id: number
    months: number
    badge_image: {
        src: string
        srcset: string
    }
}

type Chatroom = {
    id: number
    chatable_type: string
    channel_id: number
    created_at: string
    updated_at: string
    chat_mode_old: string
    chat_mode: string
    slow_mode: boolean
    chatable_id: number
    followers_mode: boolean
    subscribers_mode: boolean
    emotes_mode: boolean
    message_interval: number
    following_min_duration: number
}

type AscendingLink = {
    id: number
    channel_id: number
    description?: string
    link: string
    created_at: string
    updated_at: string
    order: number
    title: string
}

type Vod = {
    id: number
    live_stream_id: number
    slug?: string
    thumb?: string
    s3?: string
    trading_platform_id?: number
    created_at: string
    updated_at: string
    uuid: string
    views: number
    deleted_at?: string
}

type PreviousLivestream = {
    id: number
    slug: string
    channel_id: number
    created_at: string
    session_title: string
    is_live: boolean
    risk_level_id?: number
    source?: string
    twitch_channel?: string
    duration: number
    language: string
    is_mature: boolean
    viewer_count: number
    thumbnail: {
        src: string
        srcset: string
    }
    views: number
    tags: string[]
    categories: Category[]
    video: Vod
}

type Media = {
    id: number
    model_type: string
    model_id: number
    collection_name: string
    name: string
    file_name: string
    mime_type: string
    disk: string
    size: number
    manipulations: any[]
    custom_properties: any
}

type InsertedCategory = {
    id: number
    icon: string
    name: string
    slug: string
}

type SmallCategory = {
    category: InsertedCategory
    tags: string[]
}

type SearchCategory = {
    id: number
    category_id: number
    name: string
    slug: string
    tags: string[]
    description?: string
    deleted_at?: string
    viewers: number
    banner: {
        src: string
        srcset: string
    }
    category: InsertedCategory
}

type SmallUser = {
    id: number
    username: string
    agreed_to_terms: boolean
    email_verified_at?: string
    bio: string
    profilePic: string
}

type SearchChannel = {
    id: number
    user_id: number
    slug: string
    is_banned: boolean
    playback_url: string
    name_updated_at?: string
    vod_enabled: boolean
    subscription_enabled: boolean
    userId: number
    followersCount: number
    following: boolean
    subscription: boolean
    isLive: boolean
    recentCategories: SmallCategory[]
    canHost: boolean
    user: SmallUser
    verified: {
        id: number
        channel_id: number
        created_at: string
        updated_at: string
    }
}

export type SearchResponse = {
    channels: SearchChannel[]
    categories: SearchCategory[]
}

export type ChannelResponse = {
    id: number
    user_id: number
    slug: string
    is_banned: boolean
    playback_url: string
    name_updated_at?: string
    vod_enabled: boolean
    subscription_enabled: boolean
    followersCount: number
    subscriber_badges: Badge[]
    banner_image: {
        responsive: string
        url: string
    }
    recent_categories: Category[]
    livestream?: Stream
    role?: string
    muted: boolean
    follower_badges: Badge[]
    offline_banner_image?: {
        responsive: string
        url: string
    }
    can_host: boolean
    user: User
    chatroom: Chatroom
    ascending_links: AscendingLink[]
    plan: {
        id: number
        channel_id: number
        stripe_plan_id: string
        amount: string
        created_at: string
        updated_at: string
    }
    previous_livestreams: PreviousLivestream[]
    verified: {
        id: number
        channel_id: number
        created_at: string
        updated_at: string
    }
    media: Media[]
}

export type VideoResponse = Vod & {
    source: string
    livestream: Stream
}

export type ChatroomResponse = {
    id: number
    slow_mode: {
        enabled: boolean
        message_interval: number
    }
    subscribers_mode: {
        enabled: boolean
    }
    followers_mode: {
        enabled: boolean
        min_duration: number
    }
    emotes_mode: {
        enabled: boolean
    }
    pinned_message?: {
        id: number
        chatroom_id: number
    }
}

export type ChatroomMessageResponse = {
    channel: string
    data: string
    event: string
}

export type ChatroomMessage = {
    id: string
    chatroom_id: number
    content: string
    type: string
    created_at: string
    sender: {
        id: number
        username: string
        slug: string
        identity: {
            color: string
            badges: string[]
        }
    }
}

export type PrepopulateChatResponse = {
    status: {
        error: boolean
        code: number
        message: string
    }
    data: {
        cursor: string
        messages: ChatroomMessage[]
    }
}

type FollowedChannel = {
    is_live: boolean
    profile_picture: string
    channel_slug: string
    viewer_count: number
    category_name: string
    user_username: string
}

export type FollowedChannelResponse = {
    channels: FollowedChannel[]
}
