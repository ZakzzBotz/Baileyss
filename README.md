# Baileys-Zakzz — WhatsApp Bot Framework 2025 Edition

![Baileys Zakzz Logo](https://img1.pixhost.to/images/9606/654011461_alwayszakzz.jpg)

[![Stars](https://img.shields.io/github/stars/ZakzzBotz/Bails?style=for-the-badge)](https://github.com/ZakzzBotz/Bails)
[![Version](https://img.shields.io/npm/v/baileys-zakzz?style=for-the-badge)](https://www.npmjs.com/package/baileys-zakzz)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](#license)

**Baileys-Zakzz** adalah versi modern dari [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys), dirancang untuk pengembang bot WhatsApp yang membutuhkan kestabilan tinggi, struktur modular, dan kemampuan pengelolaan sesi otomatis.  
Fokus utama: *stabil, ringan, cepat, dan siap pakai untuk 2025.*

## Fitur Utama

- Pairing code cepat & fleksibel  
- Auto reconnect & session recovery otomatis  
- Kompatibel dengan WhatsApp Business  
- Struktur modular siap pakai untuk bot apa pun  
- Mendukung multi-device terbaru  
- Optimasi performa untuk VPS & cloud  
- Build system JavaScript yang bersih dan efisien  

## Instalasi

```json
{
  "dependencies": {
    "baileys": "github:ZakzzBotz/Bails"
  }
}
```
## Connecting

``` ts
import makeWASocket, { DisconnectReason } from '@ZakzzBotz/bails'
import { Boom } from '@hapi/boom'

async function connectToWhatsApp () {
    const sock = makeWASocket({
        // can provide additional config here
        printQRInTerminal: true
    })
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('opened connection')
        }
    })
    sock.ev.on('messages.upsert', m => {
        console.log(JSON.stringify(m, undefined, 2))

        console.log('replying to', m.messages[0].key.remoteJid)
        await sock.sendMessage(m.messages[0].key.remoteJid!, { text: 'Hello there!' })
    })
}
connectToWhatsApp()
``` 

## Thanks To All Developer

WhatsApp: [wa.me/6282315314215](https://wa.me/6282315314215)  
Telegram: [t.me/AlwaysZakzz](https://t.me/AlwaysZakzz)  
WhiskeySockets: [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)  
Node.js: [nodejs.org](https://nodejs.org)  

© 2026 AlwaysZakzz — All rights reserved.
