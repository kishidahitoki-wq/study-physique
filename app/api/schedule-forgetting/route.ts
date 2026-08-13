import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const qstashClient = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: Request) {
  try {
    const { subscription, title, body, scheduledAt } = await req.json();

    if (!subscription || !scheduledAt) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 指定された日時（ISO文字列）までの遅延秒数（delay）を計算
    const targetTime = new Date(scheduledAt).getTime();
    const now = new Date().getTime();
    const delaySeconds = Math.max(1, Math.floor((targetTime - now) / 1000));

    // 現在のホスト名を取得（ローカルまたはVercel本番のURL）
    const host = req.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const destinationUrl = `${protocol}://${host}/api/qstash`;

    // QStashに遅延タスク（Push通知の配信）を登録！
    const result = await qstashClient.publishJSON({
      url: destinationUrl,
      body: {
        subscription,
        title,
        pushBody: body,
      },
      delay: delaySeconds, // 指定秒数後に送る
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error('QStash Schedule Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}