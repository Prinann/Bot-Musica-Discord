require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

const token = process.env.TOKEN; // Token vem do arquivo .env

// Fila de músicas
const queue = new Map();

client.on('ready', () => {
    console.log(`✅ Bot logado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.split(' ');
    const command = args.shift().toLowerCase();

    if (command === '!play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ Você precisa estar em um canal de voz!');

        const songQuery = args.join(' ');
        if (!songQuery) return message.reply('❌ Você precisa informar o nome ou link da música!');

        let serverQueue = queue.get(message.guild.id);
        if (!serverQueue) {
            serverQueue = {
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } }),
                playing: true
            };
            queue.set(message.guild.id, serverQueue);
        }

        try {
            const song = await play.video_info(songQuery).catch(() => null);
            if (!song) return message.reply('❌ Não encontrei a música.');

            const songObj = {
                title: song.video_details.title,
                url: song.video_details.url
            };

            serverQueue.songs.push(songObj);
            message.reply(`🎵 Adicionado à fila: **${songObj.title}**`);

            if (!serverQueue.connection) {
                serverQueue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator
                });
                playSong(message.guild.id);
            }
        } catch (err) {
            console.error(err);
            message.reply('❌ Erro ao tentar adicionar a música.');
        }
    }

    if (command === '!skip') {
        const serverQueue = queue.get(message.guild.id);
        if (!serverQueue) return message.reply('❌ Não tem música na fila.');
        serverQueue.player.stop();
        message.reply('⏭️ Música pulada.');
    }

    if (command === '!stop') {
        const serverQueue = queue.get(message.guild.id);
        if (!serverQueue) return message.reply('❌ Não tem música tocando.');
        serverQueue.songs = [];
        serverQueue.player.stop();
        message.reply('🛑 Música parada e fila limpa.');
    }
});

async function playSong(guildId) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.songs.length === 0) {
        queue.delete(guildId);
        return;
    }

    const song = serverQueue.songs[0];
    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
        serverQueue.connection.subscribe(serverQueue.player);

        serverQueue.player.on('idle', () => {
            serverQueue.songs.shift();
            playSong(guildId);
        });
    } catch (err) {
        console.error(err);
        serverQueue.songs.shift();
        playSong(guildId);
    }
}

client.login(token);
