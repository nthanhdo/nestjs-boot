import { Controller, Get, Res, SetMetadata } from '@nestjs/common';
import { join } from 'path';
import { readFileSync } from 'fs';

/**
 * Serves the static mock UI at /content-ui.
 * Public endpoint — bypasses JWT auth.
 */
@Controller('content-ui')
@SetMetadata('boot:isPublic', true)
export class MockUiController {
  private readonly html: string;

  constructor() {
    try {
      this.html = readFileSync(join(__dirname, '..', 'mock-ui', 'index.html'), 'utf-8');
    } catch {
      // Fallback for bundled dist where __dirname differs
      this.html = '<html><body><h1>Content Service Mock UI</h1><p>HTML file not found in dist. Run from source.</p></body></html>';
    }
  }

  @Get()
  serve(@Res() res: any) {
    res.type('text/html').send(this.html);
  }
}
