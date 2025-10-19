import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const zipPath = path.join(process.cwd(), 'extension.zip');
    const data = await fs.readFile(zipPath);

    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="extension.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    const message = err?.code === 'ENOENT' ? 'extension.zip not found at project root' : 'Failed to read extension.zip';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
