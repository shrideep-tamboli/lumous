import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const zipPath = path.join(process.cwd(), 'extension.zip');
    const data = await fs.readFile(zipPath);
    
    // Create a ReadableStream from the file data
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="extension.zip"',
        'Cache-Control': 'no-store',
        'Content-Length': data.length.toString(),
      },
    });
  } catch (err: unknown) {
    const isEnoent =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT';
    const message = isEnoent ? 'extension.zip not found at project root' : 'Failed to read extension.zip';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
