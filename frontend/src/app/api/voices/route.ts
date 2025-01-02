import z from 'zod';

function getAcceptableScriptLength() {
  return 500;
}

function isSurrogatePear(upper: number, lower: number): boolean {
  return upper >= 0xD800 && upper <= 0xDBFF && lower >= 0xDC00 && lower <= 0xDFFF;
}

function mbStrLen(str: string): number {
  let ret = 0;

  for (let i = 0; i < str.length; i++, ret++) {
    const upper = str.charCodeAt(i);
    const lower = str.length > i + 1 ? str.charCodeAt(i + 1) : 0;

    if (isSurrogatePear(upper, lower)) {
      i++;
    }
  }

  return ret;
}
function isAcceptableScript(script: unknown): boolean {
  if (typeof script !== 'string') {
    return false;
  }

  return mbStrLen(script) <= getAcceptableScriptLength();
}

const generateVoiceRequestSchema = z.object({
  script: z
    .string({ message: '文章は必須です。' })
    .refine(value => isAcceptableScript(value), {
      message: `文章は500文字まで入力が可能です。`,
    }),
});

const nijivoiceGeneratedVoiceSchema = z.object({
  audioFileUrl: z.string().url(),
  audioFileDownloadUrl: z.string().url(),
  duration: z.number().nonnegative(),
  remainingCredits: z.number().nonnegative(),
});

const nijivoiceGenerateVoiceResponseBodySchema = z.object({
  generatedVoice: nijivoiceGeneratedVoiceSchema,
});

type NijivoiceGenerateVoiceResponseBody = z.infer<typeof nijivoiceGenerateVoiceResponseBodySchema>;

function isNijivoiceGenerateVoiceResponseBody(value: unknown): value is NijivoiceGenerateVoiceResponseBody {
  const result = nijivoiceGenerateVoiceResponseBodySchema.safeParse(value);

  return result.success;
}

export const runtime = 'edge';

export async function POST(request: Request) {
  const requestBody = await request.json();

  generateVoiceRequestSchema.parse(requestBody);

  // https://app.nijivoice.com/characters/16e979a8-cd0f-49d4-a4c4-7a25aa42e184 を利用
  const url = 'https://api.nijivoice.com/api/platform/v1/voice-actors/16e979a8-cd0f-49d4-a4c4-7a25aa42e184/generate-voice';
  const options = {
    method: 'POST',
    headers: {
      'x-api-key': String(process.env.NIJIVOICE_API_KEY),
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      script: requestBody.script,
      format: 'mp3',
      // 「ぽの」の推奨スピードは0.8なので0.8に設定
      // https://app.nijivoice.com/characters/16e979a8-cd0f-49d4-a4c4-7a25aa42e184
      speed: '0.8',
    }),
  } as const;

  const response = await fetch(url, options);

  const responseBody = await response.json();
  if (isNijivoiceGenerateVoiceResponseBody(responseBody)) {
    return Response.json({ generatedAudioFileUrl: responseBody.generatedVoice.audioFileUrl }, { status: 201 });
  }

  return Response.json({ requestBody });
}
