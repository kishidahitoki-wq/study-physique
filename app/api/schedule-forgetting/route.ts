import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

// QStashの1回の予約は7日以内にする。
// 少し余裕を持たせて6日23時間にする。
const MAX_DELAY_SECONDS =
  6 * 24 * 60 * 60 + 23 * 60 * 60;

export async function POST(req: Request) {
  try {
    const {
      subscription,
      title,
      body,
      scheduledAt,
      scheduleId,
    } = await req.json();

    if (!subscription || !scheduledAt || !scheduleId) {
      return NextResponse.json(
        {
          error:
            'Missing subscription, scheduledAt, or scheduleId',
        },
        { status: 400 }
      );
    }

    const targetTime = new Date(scheduledAt).getTime();

    if (Number.isNaN(targetTime)) {
      return NextResponse.json(
        {
          error: 'Invalid scheduledAt',
        },
        { status: 400 }
      );
    }

    const now = Date.now();

    const remainingSeconds = Math.max(
      1,
      Math.floor((targetTime - now) / 1000)
    );

    /*
     * 7日以上先なら、
     * 今から6日23時間後に「中継通知」を実行する。
     *
     * 7日以内になったら、最終的なscheduledAtまで
     * 一度だけ再予約する。
     */
    const delaySeconds = Math.min(
      remainingSeconds,
      MAX_DELAY_SECONDS
    );

    const host = req.headers.get('host');

    if (!host) {
      return NextResponse.json(
        {
          error: 'Host header is missing',
        },
        { status: 500 }
      );
    }

    const protocol = host.includes('localhost')
      ? 'http'
      : 'https';

    const destinationUrl =
      `${protocol}://${host}/api/qstash`;

    console.log('[QStash] scheduling', {
      scheduleId,
      scheduledAt,
      remainingSeconds,
      delaySeconds,
    });

    const result = await qstashClient.publishJSON({
      url: destinationUrl,

      body: {
        subscription,
        title,
        pushBody: body,

        // 最終的に通知したい日時
        scheduledAt,

        // このscheduleを識別するためのID
        scheduleId,
      },

      delay: delaySeconds,
    });

    console.log('[QStash] scheduled', {
      scheduleId,
      messageId: result.messageId,
      delaySeconds,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });

  } catch (error: any) {
    console.error(
      '[QStash] Schedule Error:',
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