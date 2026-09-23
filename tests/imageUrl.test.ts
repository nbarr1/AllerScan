import { describe, expect, it } from 'vitest';
import { resolveAllowedImageUrl } from '../server/imageUrl';

describe('resolveAllowedImageUrl', () => {
  it('rebuilds allowed Unsplash URLs from a fixed origin, keeping only known parameters', () => {
    expect(
      resolveAllowedImageUrl('https://IMAGES.unsplash.com/photo-123?auto=format&w=800&tracking=abc')
    ).toBe('https://images.unsplash.com/photo-123?auto=format&w=800');
  });

  it.each([
    'http://images.unsplash.com/photo-123',
    'https://evil.example/photo-123',
    'https://images.unsplash.com.evil.example/photo-123',
    'https://user:pass@images.unsplash.com/photo-123',
    'https://images.unsplash.com:8443/photo-123',
    'https://images.unsplash.com/photo-123#frag',
    'https://images.unsplash.com/a/%2e%2e/..%2fsecret',
    'https://images.unsplash.com/photo-123?w=<script>',
    'http://169.254.169.254/latest/meta-data',
    'not a url',
  ])('rejects %s', (url) => {
    expect(resolveAllowedImageUrl(url)).toBeNull();
  });
});
