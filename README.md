# WhatsApp AI Agent

> A real-time AI conversational agent that operates natively inside WhatsApp.

## What This Is

A Node.js backend that connects WhatsApp to an LLM pipeline.
Users message a WhatsApp number and get intelligent AI responses
in real time — no custom app, no new interface, no friction.

## Architecture
User (WhatsApp)
│
▼

WhatsApp Webhook → Express.js Server

│
▼

Session Manager (MongoDB)

└── loads conversation history

│
▼

Gemini AI Pipeline

└── processes message with full context

│
▼

Response Handler

├── success → send reply via WhatsApp API

└── failure → graceful fallback message

│
▼

User (WhatsApp) ← receives response

<img width="2165" height="1624" alt="Whatsapp AI Agent (1)" src="https://github.com/user-attachments/assets/4906f6d3-831a-4673-8fcb-74a3ed60209c" />


## Key Features

- **Native WhatsApp integration** — no custom app needed
- **Multi-turn context** — agent remembers conversation history per session
- **Graceful fallback** — handles LLM failures without silent errors
- **Webhook-driven** — real-time event processing

## Stack

- Node.js + Express.js
- WhatsApp Business API
- Google Gemini API
- MongoDB (session storage)

