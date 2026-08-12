import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { Receiver } from '@upstash/qstash';

webpush.setVapidDetails(
  process.env.VAPID_MAILTO || 'mailto:test@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  const bodyText = await request.text();

  // QStash からの署名検証（セキュリティ対策）
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });

  const signature = request.headers.get('upstash-signature');
  const isValid = await receiver.verify({
    signature: signature || '',
    body: bodyText,
  }).catch(() => false);

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subscription, title, body } = JSON.parse(bodyText);

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body })
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Push送信失敗:', err);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}