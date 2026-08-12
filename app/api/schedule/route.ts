import { Client } from '@upstash/qstash';
import { NextResponse } from 'next/server';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(request: Request) {
  try {
    const { subscription, delaySeconds } = await request.json();
    
    // 直接本番URLを指定するか、VERCEL_URL に https:// を確実に補う
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `https://${host}` : 'http://localhost:3000');

    const res = await qstash.publishJSON({
      url: `${appUrl}/api/send-push`,
      body: {
        subscription,
        title: 'マッチョくんからの通知',
        body: '復習の時間だぞ！カタボリックを起こす前に復習しよう！',
      },
      delay: delaySeconds || 10, // デフォルト10秒後
    });

    return NextResponse.json({ success: true, messageId: res.messageId });
  } catch (error) {
    console.error('予約エラー:', error);
    return NextResponse.json({ error: 'Schedule failed' }, { status: 500 });
  }
}