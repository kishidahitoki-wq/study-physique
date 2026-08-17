import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(req: Request) {
  try {
    const {
      subscription,
      title,
      body,
      scheduledAt,
    } = await req.json();

    if (!subscription || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing parameters' },
        { status: 400 }
      );
    }

    const targetTime = new Date(scheduledAt).getTime();

    if (Number.isNaN(targetTime)) {
      return NextResponse.json(
        { error: 'Invalid scheduledAt' },
        { status: 400 }
      );
    }

    const now = Date.now();

    // 過去の日時が指定された場合でも最低1秒後には送る
    const delaySeconds = Math.max(
      1,
      Math.floor((targetTime - now) / 1000)
    );

    const host = req.headers.get('host');

    if (!host) {
      return NextResponse.json(
        { error: 'Host header is missing' },
        { status: 500 }
      );
    }

    const protocol = host.includes('localhost')
      ? 'http'
      : 'https';

    const destinationUrl =
      `${protocol}://${host}/api/qstash`;

    const result = await qstashClient.publishJSON({
      url: destinationUrl,

      body: {
        subscription,
        title,
        pushBody: body,
      },

      delay: delaySeconds,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });

  } catch (error: any) {
    console.error(
      'QStash Schedule Error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to schedule notification',
      },
      { status: 500 }
    );
  }
}