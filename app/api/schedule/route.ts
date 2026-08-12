import { Client } from '@upstash/qstash';
import { NextResponse } from 'next/server';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(request: Request) {
  try {
    const { subscription, delaySeconds, title, body } = await request.json();
    
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `https://${host}` : 'http://localhost:3000');

    const res = await qstash.publishJSON({
      url: `${appUrl}/api/send-push`,
      body: {
        subscription,
        title: title || 'マッチョくんからの通知',
        body: body || '復習の時間だぞ！',
      },
      delay: delaySeconds || 10,
    });

    return NextResponse.json({ success: true, messageId: res.messageId });
  } catch (error) {
    console.error('予約エラー:', error);
    return NextResponse.json({ error: 'Schedule failed' }, { status: 500 });
  }
}