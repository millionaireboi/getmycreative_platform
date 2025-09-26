import { Buffer } from 'node:buffer';
import { GoogleGenAI, RawReferenceImage, MaskReferenceImage, MaskReferenceMode, EditMode } from '@google/genai';

interface GenerativeFillRequestBody {
  baseImageBase64?: string;
  baseImageMimeType?: string;
  maskBase64?: string;
  prompt?: string;
  brandColors?: string[];
}

const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

let vertexClient: GoogleGenAI | null = null;

const resolveVertexEnv = () => {
  const projectId = process.env.VERTEX_PROJECT_ID?.trim();
  const location = (process.env.VERTEX_LOCATION || 'us-central1').trim();
  const serviceAccountRaw = process.env.VERTEX_SERVICE_ACCOUNT_KEY?.trim();

  if (!projectId) {
    throw new Error('VERTEX_PROJECT_ID is not configured.');
  }
  if (!serviceAccountRaw) {
    throw new Error('VERTEX_SERVICE_ACCOUNT_KEY is not configured.');
  }

  return { projectId, location, serviceAccountRaw };
};

const buildVertexClient = () => {
  if (vertexClient) {
    return vertexClient;
  }

  const { projectId, location, serviceAccountRaw } = resolveVertexEnv();

  const decoded = (() => {
    if (serviceAccountRaw.startsWith('{')) {
      return serviceAccountRaw;
    }
    try {
      return Buffer.from(serviceAccountRaw, 'base64').toString('utf-8');
    } catch (error) {
      throw new Error('Failed to decode VERTEX_SERVICE_ACCOUNT_KEY. Provide raw JSON or base64-encoded JSON.');
    }
  })();

  const parsed = JSON.parse(decoded);
  const clientEmail: string | undefined = parsed.client_email;
  const privateKeyRaw: string | undefined = parsed.private_key;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('VERTEX_SERVICE_ACCOUNT_KEY is missing client_email or private_key.');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  vertexClient = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location,
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: [REQUIRED_SCOPE],
    },
  });

  return vertexClient;
};

const parseRequestBody = async (request: Request): Promise<GenerativeFillRequestBody> => {
  try {
    return (await request.json()) as GenerativeFillRequestBody;
  } catch (error) {
    throw new Error('Invalid JSON payload.');
  }
};

const validateRequest = (body: GenerativeFillRequestBody) => {
  if (!body.baseImageBase64 || !body.baseImageMimeType) {
    throw new Error('Missing base image payload.');
  }
  if (!body.maskBase64) {
    throw new Error('Missing generative fill mask.');
  }
  if (!body.prompt || !body.prompt.trim()) {
    throw new Error('Missing prompt describing the fill.');
  }
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Allow': 'POST' },
    });
  }

  try {
    const body = await parseRequestBody(request);
    validateRequest(body);

    const client = buildVertexClient();

  const rawReference = new RawReferenceImage();
  rawReference.referenceImage = {
    imageBytes: body.baseImageBase64!,
    mimeType: body.baseImageMimeType!,
  };
  rawReference.referenceId = 1;

  const maskReference = new MaskReferenceImage();
  maskReference.referenceImage = {
    imageBytes: body.maskBase64!,
    mimeType: 'image/png',
  };
  maskReference.config = {
    maskMode: MaskReferenceMode.MASK_MODE_USER_PROVIDED,
  };
  maskReference.referenceId = 2;

    const prompt = body.prompt!.trim();
    const directives: string[] = [
      `Inside the masked region, ${prompt}.`,
      'Blend seamlessly with the unmasked area. Match lighting, textures, color grading, and perspective so the edit is invisible.',
      'Leave every unmasked pixel untouched.',
    ];

    if (body.brandColors && body.brandColors.length > 0) {
      directives.push(`If it feels natural, weave in these brand colours without overpowering the scene: ${body.brandColors.join(', ')}.`);
    }

    const response = await client.models.editImage({
      model: 'imagen-3.0-capability-001',
      prompt: directives.join(' '),
      referenceImages: [rawReference, maskReference],
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        editMode: EditMode.EDIT_MODE_INPAINT_INSERTION,
      },
    });

    const generated = response.generatedImages?.[0]?.image;
    const base64 = generated?.imageBytes;
    const mimeType = generated?.mimeType || 'image/png';

    if (!base64) {
      const metadata = response.generatedImages?.[0] as { raiReason?: string; errorReason?: string } | undefined;
      const reason = metadata?.raiReason ?? metadata?.errorReason ?? 'No image returned by Vertex.';
      throw new Error(reason);
    }

    return Response.json({ base64, mimeType });
  } catch (error) {
    console.error('Generative fill handler failed:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message.includes('Missing') || message.includes('Invalid') ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
