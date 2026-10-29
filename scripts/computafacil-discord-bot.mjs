/**
 * KingBux Discord bot (standalone, Node.js 22+; no website dependency).
 * Start in PowerShell: $env:DISCORD_TOKEN = 'BOT_TOKEN'; node .\discord-bot.mjs
 * The token must be kept private. The app needs View Channels, Send Messages,
 * Embed Links, Attach Files, Manage Channels, and Read Message History.
 */

const GUILD_ID = '1485757672845479946';
const TICKET_PANEL_CHANNEL_ID = '1565037248661950664';
const FEEDBACK_PANEL_CHANNEL_ID = '1565038341097918474';
const FEEDBACK_DESTINATION_CHANNEL_ID = '1565035939473133609';
const RED = 0xffe500;
const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_TOKEN?.trim();
const VIEW_CHANNEL = 1 << 10;
const SEND_MESSAGES = 1 << 11;
const READ_HISTORY = 1 << 16;
const MANAGE_CHANNELS = 1 << 4;
const ADMINISTRATOR = 1 << 3;
const CHANNEL_ACCESS = String(VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY);
const MAX_FEEDBACK_FILES = 5;
const MAX_FEEDBACK_BYTES = 25 * 1024 * 1024;

let gatewaySocket;
let heartbeatTimer;
let heartbeatAcked = true;
let sequence = null;
let botUser;
let reconnectAttempts = 0;
let stopping = false;

async function discordApi(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bot ${TOKEN}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) {
    const result = await response.json().catch(() => ({}));
    const wait = Math.ceil((result.retry_after ?? 1) * 1000) + 100;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return discordApi(path, { method, body, form });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Discord API ${response.status} em ${path}: ${detail.slice(0, 700)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function interactionCallback(interaction, payload) {
  const response = await fetch(`${API}/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Falha ao responder interação (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
}

async function editInteractionReply(interaction, data) {
  const response = await fetch(`${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar resposta (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json().catch(() => null);
}

function getUser(interaction) {
  return interaction.member?.user ?? interaction.user;
}

function redEmbed(title, description, extra = {}) {
  return { title, description, color: RED, ...extra };
}

function panelMarker(message, marker) {
  return message.author?.id === botUser.id && message.embeds?.some((embed) => embed.footer?.text === marker);
}

async function upsertPanel(channelId, marker, payload, previousMarker = marker) {
  const channel = await discordApi(`/channels/${channelId}`);
  if (channel.guild_id !== GUILD_ID || channel.type !== 0) {
    throw new Error(`O canal ${channelId} não é um canal de texto do servidor configurado.`);
  }
  const messages = await discordApi(`/channels/${channelId}/messages?limit=100`);
  const existing = messages.find((message) => panelMarker(message, marker) || panelMarker(message, previousMarker));
  if (existing) {
    await discordApi(`/channels/${channelId}/messages/${existing.id}`, { method: 'PATCH', body: payload });
    console.log(`Painel atualizado no canal ${channelId}.`);
  } else {
    await discordApi(`/channels/${channelId}/messages`, { method: 'POST', body: payload });
    console.log(`Painel publicado no canal ${channelId}.`);
  }
}

async function provisionPanels() {
  const guild = await discordApi(`/guilds/${GUILD_ID}`);
  if (guild.id !== GUILD_ID) throw new Error('O servidor autorizado não corresponde ao servidor esperado.');
  const feedbackDestination = await discordApi(`/channels/${FEEDBACK_DESTINATION_CHANNEL_ID}`);
  if (feedbackDestination.guild_id !== GUILD_ID || feedbackDestination.type !== 0) {
    throw new Error('O canal de destino do feedback não pertence ao único servidor autorizado.');
  }
  await upsertPanel(TICKET_PANEL_CHANNEL_ID, 'KingBux • painel de tickets', {
    embeds: [redEmbed(
      'Central de Atendimento KINGBUX',
      'Precisa de ajuda com um pedido, produto ou dúvida? Abra um ticket privado para conversar com a equipe KingBux. Nossa equipe responderá assim que possível.',
      { footer: { text: 'KingBux • painel de tickets' }, image: { url: 'https://media.tenor.com/DEFjI7HMcfYAAAAC/ola.gif' } },
    )],
    components: [{ type: 1, components: [{ type: 2, style: 4, custom_id: 'cf:ticket:create', label: 'Abrir ticket', emoji: { name: '🎫' } }] }],
    allowed_mentions: { parse: [] },
  }, 'ComputaFacil • painel de tickets');
  await upsertPanel(FEEDBACK_PANEL_CHANNEL_ID, 'KingBux • painel de feedback', {
    embeds: [redEmbed(
      'Compartilhe seu feedback com a KingBux',
      'Sua opinião ajuda a KingBux a melhorar. Clique no botão para informar seu nome e a descrição, e se quiser anexar imagens, vídeos ou um PDF.',
      { footer: { text: 'KingBux • painel de feedback' } },
    )],
    components: [{ type: 1, components: [{ type: 2, style: 4, custom_id: 'cf:feedback:open', label: 'Enviar feedback', emoji: { name: '💬' } }] }],
    allowed_mentions: { parse: [] },
  }, 'ComputaFacil • painel de feedback');
  await provisionSupportResponderCommand();
}

async function provisionSupportResponderCommand() {
  const route = `/applications/${botUser.id}/guilds/${GUILD_ID}/commands`;
  const commands = await discordApi(route);
  const existing = commands.find((command) => command.name === 'responder');
  const command = {
    name: 'responder',
    description: 'Responde à pessoa no chat da loja sem revelar seu nome no site.',
    options: [{ type: 3, name: 'mensagem', description: 'Texto que será enviado ao visitante', required: true, min_length: 1, max_length: 1500 }],
  };
  if (existing) await discordApi(`${route}/${existing.id}`, { method: 'PATCH', body: command });
  else await discordApi(route, { method: 'POST', body: command });
  console.log('Comando /responder sincronizado para as conversas privadas do site.');
}

function feedbackModal() {
  return {
    type: 9,
    data: {
      custom_id: 'cf:feedback:submit',
      title: 'Novo Feedback',
      components: [
        {
          type: 18,
          label: 'Seu nome',
          description: 'Este nome aparecerá em texto menor acima do feedback.',
          component: {
            type: 4,
            custom_id: 'display_name',
            style: 1,
            min_length: 2,
            max_length: 80,
            placeholder: 'Como devemos identificar você?',
            required: true,
          },
        },
        {
          type: 18,
          label: 'Descrição',
          description: 'Conte sua sugestão, experiência ou problema (até 4.000 caracteres).',
          component: {
            type: 4,
            custom_id: 'description',
            style: 2,
            min_length: 3,
            max_length: 4000,
            placeholder: 'Escreva seu feedback com o máximo de detalhes que puder…',
            required: true,
          },
        },
        {
          type: 18,
          label: 'Anexos (opcional)',
          description: 'Você pode enviar até 5 imagens, vídeos ou arquivos PDF.',
          component: {
            type: 19,
            custom_id: 'attachments',
            min_values: 0,
            max_values: MAX_FEEDBACK_FILES,
            file_types: ['image', 'video', '.pdf'],
            required: false,
          },
        },
      ],
    },
  };
}

function readModalValue(components, customId) {
  for (const row of components ?? []) {
    if (row.custom_id === customId) return row.value;
    if (row.component?.custom_id === customId) return row.component.value;
    const nested = readModalValue(row.components, customId);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function readModalValues(components, customId) {
  for (const row of components ?? []) {
    if (row.custom_id === customId) return row.values ?? [];
    if (row.component?.custom_id === customId) return row.component.values ?? [];
    const nested = readModalValues(row.components, customId);
    if (nested.length) return nested;
  }
  return [];
}

function formatTicketSlug(username, userId) {
  const name = (username || 'cliente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'cliente';
  return `ticket-${name}-${userId.slice(-4)}`;
}

async function managerRoleOverwrites() {
  const roles = await discordApi(`/guilds/${GUILD_ID}/roles`);
  return roles.filter((role) => role.id !== GUILD_ID && ((BigInt(role.permissions) & BigInt(MANAGE_CHANNELS | ADMINISTRATOR)) !== 0n))
    .map((role) => ({ id: role.id, type: 0, allow: CHANNEL_ACCESS, deny: '0' }));
}

async function createTicket(interaction) {
  const user = getUser(interaction);
  if (!user?.id) throw new Error('Não consegui identificar sua conta Discord.');
  const channels = await discordApi(`/guilds/${GUILD_ID}/channels`);
  const alreadyOpen = channels.find((channel) => channel.type === 0 && channel.topic === `computafacil-ticket-owner:${user.id}`);
  if (alreadyOpen) {
    await editInteractionReply(interaction, { content: `Você já tem um ticket aberto: <#${alreadyOpen.id}>`, allowed_mentions: { parse: [] } });
    return;
  }
  const overwrites = [
    { id: GUILD_ID, type: 0, allow: '0', deny: String(VIEW_CHANNEL) },
    { id: user.id, type: 1, allow: CHANNEL_ACCESS, deny: '0' },
    { id: botUser.id, type: 1, allow: CHANNEL_ACCESS, deny: '0' },
    ...await managerRoleOverwrites(),
  ];
  const channel = await discordApi(`/guilds/${GUILD_ID}/channels`, {
    method: 'POST',
    body: {
      name: formatTicketSlug(user.global_name ?? user.username, user.id),
      type: 0,
      topic: `computafacil-ticket-owner:${user.id}`,
      permission_overwrites: [...new Map(overwrites.map((overwrite) => [overwrite.id, overwrite])).values()],
    },
  });
  await discordApi(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: {
      embeds: [redEmbed('Ticket aberto', `Olá <@${user.id}>! Conte para a equipe KingBux como podemos ajudar. Para encerrar esta conversa, use o botão abaixo.`, {
        footer: { text: 'KingBux • atendimento privado' },
      })],
      components: [{ type: 1, components: [{ type: 2, style: 2, custom_id: 'cf:ticket:close', label: 'Fechar ticket', emoji: { name: '🔒' } }] }],
      allowed_mentions: { users: [user.id] },
    },
  });
  await editInteractionReply(interaction, { content: `Seu ticket foi criado: <#${channel.id}>`, allowed_mentions: { parse: [] } });
  console.log(`Ticket criado no servidor autorizado para ${user.id}.`);
}

async function closeTicket(interaction) {
  const channel = await discordApi(`/channels/${interaction.channel_id}`);
  if (channel.guild_id !== GUILD_ID || !channel.topic?.startsWith('computafacil-ticket-owner:')) {
    await interactionCallback(interaction, { type: 4, data: { content: 'Este canal não é um ticket da KingBux.', flags: 64 } });
    return;
  }
  const ownerId = channel.topic.slice('computafacil-ticket-owner:'.length);
  const permissions = BigInt(interaction.member?.permissions ?? '0');
  const isOwner = getUser(interaction)?.id === ownerId;
  const isManager = (permissions & BigInt(MANAGE_CHANNELS | ADMINISTRATOR)) !== 0n;
  if (!isOwner && !isManager) {
    await interactionCallback(interaction, { type: 4, data: { content: 'Somente quem abriu este ticket ou a equipe pode fechá-lo.', flags: 64 } });
    return;
  }
  await interactionCallback(interaction, { type: 5, data: { flags: 64 } });
  await editInteractionReply(interaction, { content: 'Ticket encerrado. Este canal será removido em instantes.' });
  setTimeout(() => discordApi(`/channels/${channel.id}`, { method: 'DELETE' })
    .then(() => console.log(`Ticket ${channel.id} encerrado.`))
    .catch((error) => console.error('Não foi possível remover o ticket:', error.message)), 1200).unref?.();
}

async function uploadFeedbackFiles(interaction, attachmentIds) {
  const resolved = interaction.data?.resolved?.attachments ?? {};
  const selected = attachmentIds.map((id) => resolved[id]).filter(Boolean).slice(0, MAX_FEEDBACK_FILES);
  const files = [];
  let totalBytes = 0;
  for (const attachment of selected) {
    const url = new URL(attachment.url);
    if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
      throw new Error('Um dos anexos não veio de um endereço válido do Discord.');
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Não consegui buscar o anexo ${attachment.filename}. Tente enviá-lo novamente.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_FEEDBACK_BYTES) throw new Error('Os anexos somados ultrapassam o limite de 25 MB por feedback.');
    const filename = attachment.filename.replace(/[\\/\r\n]/g, '_').slice(0, 180) || `anexo-${files.length + 1}`;
    files.push({ filename, contentType: attachment.content_type || 'application/octet-stream', bytes });
  }
  return files;
}

async function sendFeedback(interaction) {
  const displayName = String(readModalValue(interaction.data.components, 'display_name') ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
  const description = String(readModalValue(interaction.data.components, 'description') ?? '').trim();
  const fileIds = readModalValues(interaction.data.components, 'attachments');
  if (displayName.length < 2 || description.length < 3) {
    await interactionCallback(interaction, { type: 4, data: { content: 'Informe seu nome e escreva um feedback com pelo menos 3 caracteres.', flags: 64 } });
    return;
  }
  await interactionCallback(interaction, { type: 5, data: { flags: 64 } });
  try {
    const files = await uploadFeedbackFiles(interaction, fileIds);
    const imageFiles = files.filter((file) => file.contentType.startsWith('image/'));
    const embeds = [redEmbed('Novo Feedback!', description, {
      author: { name: displayName },
      footer: { text: 'KingBux • feedback' },
      timestamp: new Date().toISOString(),
      ...(imageFiles[0] ? { image: { url: `attachment://${imageFiles[0].filename}` } } : {}),
    }), ...imageFiles.slice(1).map((file) => ({
      color: RED,
      image: { url: `attachment://${file.filename}` },
    }))];
    const payload = {
      embeds,
      allowed_mentions: { parse: [] },
      ...(files.length ? { attachments: files.map((file, id) => ({ id, filename: file.filename })) } : {}),
    };
    if (files.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      files.forEach((file, index) => form.append(`files[${index}]`, new Blob([file.bytes], { type: file.contentType }), file.filename));
      await discordApi(`/channels/${FEEDBACK_DESTINATION_CHANNEL_ID}/messages`, { method: 'POST', form });
    } else {
      await discordApi(`/channels/${FEEDBACK_DESTINATION_CHANNEL_ID}/messages`, { method: 'POST', body: payload });
    }
    await editInteractionReply(interaction, { content: 'Obrigado! Seu feedback foi enviado para a equipe KingBux.' });
    console.log(`Feedback recebido no canal configurado; anexos: ${files.length}.`);
  } catch (error) {
    console.error('Falha ao encaminhar feedback:', error.message);
    await editInteractionReply(interaction, { content: `Não consegui encaminhar seu feedback: ${error.message}` }).catch((replyError) => console.error(replyError.message));
  }
}

async function replyToSupportChat(interaction) {
  const channel = await discordApi(`/channels/${interaction.channel_id}`);
  const message = interaction.data?.options?.find((option) => option.name === 'mensagem')?.value;
  if (channel.guild_id !== GUILD_ID || channel.type !== 12 || channel.parent_id !== FEEDBACK_DESTINATION_CHANNEL_ID || !/^Atendimento (?:CF|KB)-[A-F0-9]{6}$/i.test(channel.name || '')) {
    await interactionCallback(interaction, { type: 4, data: { content: 'Use /responder dentro de uma conversa privada iniciada pelo chat da loja.', flags: 64 } });
    return;
  }
  if (typeof message !== 'string' || !message.trim() || message.length > 1500) {
    await interactionCallback(interaction, { type: 4, data: { content: 'A resposta precisa ter entre 1 e 1.500 caracteres.', flags: 64 } });
    return;
  }
  await discordApi(`/channels/${interaction.channel_id}/messages`, {
    method: 'POST',
    body: {
      embeds: [{ title: 'Resposta da equipe', description: message.trim(), color: RED, footer: { text: 'CF:site-reply' } }],
      allowed_mentions: { parse: [] },
    },
  });
  await interactionCallback(interaction, { type: 4, data: { content: 'Resposta enviada ao chat do site.', flags: 64 } });
}

async function handleInteraction(interaction) {
  // Hard boundary: the bot ignores every server other than the one requested.
  if (interaction.guild_id !== GUILD_ID) return;
  if (interaction.type === 2 && interaction.data?.name === 'responder') {
    await replyToSupportChat(interaction);
    return;
  }
  const customId = interaction.data?.custom_id;
  if (interaction.type === 3 && customId === 'cf:ticket:create' && interaction.channel_id === TICKET_PANEL_CHANNEL_ID) {
    await interactionCallback(interaction, { type: 5, data: { flags: 64 } });
    try {
      await createTicket(interaction);
    } catch (error) {
      console.error('Falha ao abrir ticket:', error.message);
      await editInteractionReply(interaction, { content: `Não consegui abrir o ticket: ${error.message}` }).catch((replyError) => console.error(replyError.message));
    }
    return;
  }
  if (interaction.type === 3 && customId === 'cf:feedback:open' && interaction.channel_id === FEEDBACK_PANEL_CHANNEL_ID) {
    await interactionCallback(interaction, feedbackModal());
    return;
  }
  if (interaction.type === 5 && customId === 'cf:feedback:submit' && interaction.channel_id === FEEDBACK_PANEL_CHANNEL_ID) {
    await sendFeedback(interaction);
    return;
  }
  if (interaction.type === 3 && customId === 'cf:ticket:close') {
    await closeTicket(interaction);
  }
}

function sendGateway(payload) {
  if (gatewaySocket?.readyState === WebSocket.OPEN) gatewaySocket.send(JSON.stringify(payload));
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
}

async function connectGateway() {
  if (stopping) return;
  const { url } = await discordApi('/gateway/bot');
  const gatewayUrl = `${url}${url.includes('?') ? '&' : '?'}v=10&encoding=json`;
  await new Promise((resolve) => {
    gatewaySocket = new WebSocket(gatewayUrl);
    let settled = false;
    const settle = () => { if (!settled) { settled = true; resolve(); } };
    gatewaySocket.addEventListener('open', () => console.log('Conectado ao Gateway do Discord.'));
    gatewaySocket.addEventListener('message', async ({ data }) => {
      let packet;
      try { packet = JSON.parse(typeof data === 'string' ? data : await data.text()); }
      catch { console.error('O Gateway enviou um pacote que não pôde ser lido.'); return; }
      if (packet.s !== null && packet.s !== undefined) sequence = packet.s;
      if (packet.op === 10) {
        const interval = packet.d.heartbeat_interval;
        stopHeartbeat();
        setTimeout(() => {
          heartbeatTimer = setInterval(() => {
            if (!heartbeatAcked) {
              console.error('Heartbeat não confirmado; reconectando ao Gateway.');
              gatewaySocket?.close(4000, 'heartbeat timeout');
              stopHeartbeat();
              return;
            }
            heartbeatAcked = false;
            sendGateway({ op: 1, d: sequence });
          }, interval);
          heartbeatAcked = false;
          sendGateway({ op: 1, d: sequence });
        }, Math.random() * interval).unref?.();
        sendGateway({
          op: 2,
          d: {
            token: TOKEN,
            intents: 1, // GUILDS only; support replies use interactions and bot-authored embeds, no message-content intent.
            properties: { os: process.platform, browser: 'computafacil-standalone-bot', device: 'computafacil-standalone-bot' },
          },
        });
      } else if (packet.op === 11) {
        heartbeatAcked = true;
      } else if (packet.op === 7 || packet.op === 9) {
        gatewaySocket?.close(4001, 'Gateway requested reconnect');
      } else if (packet.op === 0 && packet.t === 'READY') {
        botUser = packet.d.user;
        reconnectAttempts = 0;
        console.log(`Bot conectado como ${botUser.username}; servidor autorizado ${GUILD_ID}.`);
        provisionPanels().catch((error) => console.error('Não consegui publicar os painéis:', error.message));
      } else if (packet.op === 0 && packet.t === 'INTERACTION_CREATE') {
        handleInteraction(packet.d).catch((error) => console.error('Falha ao tratar interação:', error.message));
      }
    });
    gatewaySocket.addEventListener('error', () => console.error('Erro na conexão com o Gateway do Discord.'));
    gatewaySocket.addEventListener('close', ({ code, reason }) => {
      stopHeartbeat();
      console.log(`Gateway desconectado (${code}${reason ? `: ${reason}` : ''}).`);
      settle();
      if (!stopping) {
        const delay = Math.min(30_000, 1000 * (2 ** reconnectAttempts++));
        setTimeout(() => connectGateway().catch((error) => console.error('Falha ao reconectar:', error.message)), delay).unref?.();
      }
    });
  });
}

async function main() {
  if (!TOKEN) {
    console.error('Defina DISCORD_TOKEN com o token privado do bot e execute novamente.');
    process.exitCode = 1;
    return;
  }
  if (typeof WebSocket === 'undefined' || typeof fetch === 'undefined') {
    throw new Error('Este bot requer Node.js 22 ou superior (fetch e WebSocket nativos).');
  }
  const me = await discordApi('/users/@me');
  botUser = me;
  const guild = await discordApi(`/guilds/${GUILD_ID}`);
  if (guild.id !== GUILD_ID) throw new Error('O bot não está no servidor autorizado informado.');
  console.log(`Configuração validada para ${guild.name}. Nenhum outro servidor será atendido.`);
  await connectGateway();
}

process.on('SIGINT', () => { stopping = true; stopHeartbeat(); gatewaySocket?.close(1000, 'shutdown'); });
process.on('SIGTERM', () => { stopping = true; stopHeartbeat(); gatewaySocket?.close(1000, 'shutdown'); });
main().catch((error) => { console.error('O bot não iniciou:', error.message); process.exitCode = 1; });
