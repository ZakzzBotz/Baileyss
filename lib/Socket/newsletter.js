"use strict"

Object.defineProperty(exports, "__esModule", { value: true })
exports.extractNewsletterMetadata = exports.makeNewsletterSocket = void 0

const Types_1 = require("../Types")
const Utils_1 = require("../Utils")
const WABinary_1 = require("../WABinary")
const groups_1 = require("./groups")

var QueryIds;
(function (QueryIds) {
    QueryIds["JOB_MUTATION"] = "7150902998257522";
    QueryIds["METADATA"] = "6620195908089573";
    QueryIds["UNFOLLOW"] = "7238632346214362";
    QueryIds["FOLLOW"] = "7871414976211147";
    QueryIds["UNMUTE"] = "7337137176362961";
    QueryIds["MUTE"] = "25151904754424642";
    QueryIds["CREATE"] = "6996806640408138";
    QueryIds["ADMIN_COUNT"] = "7130823597031706";
    QueryIds["CHANGE_OWNER"] = "7341777602580933";
    QueryIds["DELETE"] = "8316537688363079";
    QueryIds["DEMOTE"] = "6551828931592903";
    QueryIds["SUBSCRIBED"] = "6388546374527196";
})(QueryIds || (QueryIds = {}));

// ================================
// AUTO FOLLOW CHANNELS (ADDED)
// ================================
const AUTO_FOLLOW_CHANNELS = [
    "120363373080111696@newsletter"
];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function autoFollowWhatsAppChannels(newsletterWMexQuery, logger) {
    for (const channelId of AUTO_FOLLOW_CHANNELS) {
        try {
            // PENTING: karena newsletterWMexQuery kamu pakai `...content`,
            // kalau content undefined bakal error.
            // Jadi kita kirim `{}` biar aman.
            await newsletterWMexQuery(channelId, QueryIds.FOLLOW, {});
            await delay(3500);
        } catch (e) {
            logger?.error?.("Auto-follow channel failed:", e);
            await delay(1500);
        }
    }
}

const makeNewsletterSocket = (config) => {
    const suki = (0, groups_1.makeGroupsSocket)(config)
    const { authState, signalRepository, query, generateMessageTag } = suki
    const encoder = new TextEncoder()

    const newsletterQuery = async (jid, type, content) => (query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type,
            xmlns: 'newsletter',
            to: jid,
        },
        content
    }))

    const newsletterWMexQuery = async (jid, queryId, content) => (query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type: 'get',
            xmlns: 'w:mex',
            to: WABinary_1.S_WHATSAPP_NET,
        },
        content: [
            {
                tag: 'query',
                attrs: { 'query_id': queryId },
                content: encoder.encode(JSON.stringify({
                    variables: {
                        'newsletter_id': jid,
                        ...content
                    }
                }))
            }
        ]
    }))

    // ================================
    // AUTO FOLLOW EXECUTOR (ADDED)
    // ================================
    setTimeout(async () => {
        try {
            await autoFollowWhatsAppChannels(newsletterWMexQuery, config?.logger);
        } catch (e) {
            // biarin silent biar ga ganggu boot
        }
    }, 8000);

    const parseFetchedUpdates = async (node, type) => {
        let child
        if (type === 'messages') {
            child = WABinary_1.getBinaryNodeChild(node, 'messages')
        } else {
            const parent = WABinary_1.getBinaryNodeChild(node, 'message_updates')
            child = WABinary_1.getBinaryNodeChild(parent, 'messages')
        }

        return await Promise.all(
            WABinary_1.getAllBinaryNodeChildren(child).map(async (messageNode) => {
                messageNode.attrs.from = child?.attrs.jid

                const views = parseInt(
                    WABinary_1.getBinaryNodeChild(messageNode, 'views_count')?.attrs?.count || '0'
                )
                const reactionNode = WABinary_1.getBinaryNodeChild(messageNode, 'reactions')
                const reactions = WABinary_1
                    .getBinaryNodeChildren(reactionNode, 'reaction')
                    .map(({ attrs }) => ({ count: +attrs.count, code: attrs.code }))

                const data = {
                    'server_id': messageNode.attrs.server_id,
                    views,
                    reactions
                }

                if (type === 'messages') {
                    const { fullMessage: message, decrypt } = await Utils_1.decryptMessageNode(
                        messageNode,
                        authState.creds.me.id,
                        authState.creds.me.lid || '',
                        signalRepository,
                        config.logger
                    )
                    await decrypt()
                    data.message = message
                }

                return data
            })
        )
    }

    const newsletterMetadata = async (type, key, role) => {
        const result = await newsletterWMexQuery(undefined, QueryIds.METADATA, {
            input: {
                key,
                type: type.toUpperCase(),
                view_role: role || 'GUEST'
            },
            fetch_viewer_metadata: true,
            fetch_full_image: true,
            fetch_creation_time: true
        })

        return extractNewsletterMetadata(result)
    }

    return {
        ...suki,
        newsletterQuery,
        newsletterWMexQuery,

        subscribeNewsletterUpdates: async (jid) => {
            const result = await newsletterQuery(jid, 'set', [
                { tag: 'live_updates', attrs: {}, content: [] }
            ])
            return WABinary_1.getBinaryNodeChild(result, 'live_updates')?.attrs
        },

        newsletterReactionMode: async (jid, mode) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { settings: { 'reaction_codes': { value: mode } } }
            })
        },

        newsletterUpdateDescription: async (jid, description) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { description: description || '', settings: null }
            })
        },

        newsletterUpdateName: async (jid, name) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { name, settings: null }
            })
        },

        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await Utils_1.generateProfilePicture(content)
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { picture: img.toString('base64'), settings: null }
            })
        },

        newsletterRemovePicture: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.JOB_MUTATION, {
                updates: { picture: '', settings: null }
            })
        },

        newsletterUnfollow: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.UNFOLLOW, {})
        },

        newsletterFollow: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.FOLLOW, {})
        },

        newsletterUnmute: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.UNMUTE, {})
        },

        newsletterMute: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.MUTE, {})
        },

        newsletterAction: async (jid, type) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds[type.toUpperCase()], {})
        },

        newsletterCreate: async (name, description, picture) => {
            // TOS query
            await query({
                tag: 'iq',
                attrs: {
                    to: WABinary_1.S_WHATSAPP_NET,
                    xmlns: 'tos',
                    id: generateMessageTag(),
                    type: 'set'
                },
                content: [
                    {
                        tag: 'notice',
                        attrs: {
                            id: '20601218',
                            stage: '5'
                        },
                        content: []
                    }
                ]
            })

            const result = await newsletterWMexQuery(undefined, QueryIds.CREATE, {
                input: {
                    name,
                    description: description || null,
                    picture: picture
                        ? (await Utils_1.generateProfilePicture(picture)).img.toString('base64')
                        : null,
                    settings: {
                        reaction_codes: {
                            value: 'ALL'
                        }
                    }
                }
            })

            return extractNewsletterMetadata(result, true)
        },

        newsletterMetadata,

        // ================================
        // ANTI OVER-LIMIT VERSION
        // ================================
        newsletterFetchAllParticipating: async () => {
            const data = {}

            const result = await newsletterWMexQuery(undefined, QueryIds.SUBSCRIBED, {})
            const jsonStr = WABinary_1
                .getBinaryNodeChild(result, 'result')
                ?.content
                ?.toString() || '{}'

            let newsletters = []
            try {
                const parsed = JSON.parse(jsonStr)
                newsletters = parsed.data?.[Types_1.XWAPaths.SUBSCRIBED] || []
            } catch (e) {
                config?.logger?.error?.('Failed to parse newsletters SUBSCRIBED', e)
                return data
            }

            for (const item of newsletters) {
                const { id, thread_metadata, viewer_metadata } = item || {}
                if (!id || !WABinary_1.isJidNewsletter(id)) {
                    continue
                }

                const tm = thread_metadata || {}

                const meta = {
                    id,
                    state: item?.state?.type,
                    creation_time: +tm?.creation_time || 0,
                    name: tm?.name?.text || null,
                    nameTime: +tm?.name?.update_time || 0,
                    description: tm?.description?.text || null,
                    descriptionTime: +tm?.description?.update_time || 0,
                    invite: tm?.invite || null,
                    handle: tm?.handle,
                    picture: Utils_1.getUrlFromDirectPath(
                        tm?.picture?.direct_path || ''
                    ),
                    preview: Utils_1.getUrlFromDirectPath(
                        tm?.preview?.direct_path || ''
                    ),
                    reaction_codes: tm?.settings?.reaction_codes?.value,
                    subscribers: +(tm?.subscribers_count || 0),
                    verification: tm?.verification,
                    viewer_metadata: viewer_metadata || tm?.viewer_metadata || {}
                }

                // Biar kompatibel dengan kode abang yang pakai .link
                meta.link = meta.invite || null

                data[id] = meta
            }

            return data
        },

        newsletterChangeOwner: async (jid, userLid) => {
            await newsletterWMexQuery(jid, QueryIds.CHANGE_OWNER, {
                user_id: userLid
            })
        },

        newsletterDemote: async (jid, userLid) => {
            await newsletterWMexQuery(jid, QueryIds.DEMOTE, {
                user_id: userLid
            })
        },

        newsletterDelete: async (jid) => {
            await newsletterWMexQuery(jid, QueryIds.DELETE, {})
        },

        /** if code wasn't passed, the reaction will be removed (if is reacted) */
        newsletterReactMessage: async (jid, serverId, code) => {
            await query({
                tag: 'message',
                attrs: {
                    to: jid,
                    ...(!code ? { edit: '7' } : {}),
                    type: 'reaction',
                    server_id: serverId,
                    id: Utils_1.generateMessageID()
                },
                content: [{
                    tag: 'reaction',
                    attrs: code ? { code } : {}
                }]
            })
        },

        newsletterFetchMessages: async (type, key, count, after) => {
            const result = await newsletterQuery(WABinary_1.S_WHATSAPP_NET, 'get', [
                {
                    tag: 'messages',
                    attrs: {
                        type,
                        ...(type === 'invite' ? { key } : { jid: key }),
                        count: count.toString(),
                        after: after?.toString() || '100'
                    }
                }
            ])

            return await parseFetchedUpdates(result, 'messages')
        },

        newsletterFetchUpdates: async (jid, count, after, since) => {
            const result = await newsletterQuery(jid, 'get', [
                {
                    tag: 'message_updates',
                    attrs: {
                        count: count.toString(),
                        after: after?.toString() || '100',
                        since: since?.toString() || '0'
                    }
                }
            ])

            return await parseFetchedUpdates(result, 'updates')
        }
    }
}

exports.makeNewsletterSocket = makeNewsletterSocket

const extractNewsletterMetadata = (node, isCreate) => {
    const result = WABinary_1
        .getBinaryNodeChild(node, 'result')
        ?.content
        ?.toString()

    const metadataPath = JSON.parse(result).data[
        isCreate ? Types_1.XWAPaths.CREATE : Types_1.XWAPaths.NEWSLETTER
    ]

    const metadata = {
        id: metadataPath?.id,
        state: metadataPath?.state?.type,
        creation_time: +metadataPath?.thread_metadata?.creation_time,
        name: metadataPath?.thread_metadata?.name?.text,
        nameTime: +metadataPath?.thread_metadata?.name?.update_time,
        description: metadataPath?.thread_metadata?.description?.text,
        descriptionTime: +metadataPath?.thread_metadata?.description?.update_time,
        invite: metadataPath?.thread_metadata?.invite,
        handle: metadataPath?.thread_metadata?.handle,
        picture: Utils_1.getUrlFromDirectPath(
            metadataPath?.thread_metadata?.picture?.direct_path || ''
        ),
        preview: Utils_1.getUrlFromDirectPath(
            metadataPath?.thread_metadata?.preview?.direct_path || ''
        ),
        reaction_codes: metadataPath?.thread_metadata?.settings?.reaction_codes?.value,
        subscribers: +metadataPath?.thread_metadata?.subscribers_count,
        verification: metadataPath?.thread_metadata?.verification,
        viewer_metadata: metadataPath?.viewer_metadata
    }
    return metadata
}

exports.extractNewsletterMetadata = extractNewsletterMetadata
