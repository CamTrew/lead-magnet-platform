import type { LeadMagnet } from './types';

type PostSignupFields = Pick<
  LeadMagnet,
  | 'postSignupMode'
  | 'postSignupRedirectUrl'
  | 'postSignupQuizEnabled'
  | 'postSignupQuizQuestions'
>;

export type PostSignupExperience =
  | { kind: 'message' }
  | { kind: 'redirect'; url: string }
  | { kind: 'page' }
  | { kind: 'quiz' };

export function isSafePostSignupDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function resolvePostSignupExperience(magnet: PostSignupFields): PostSignupExperience {
  if (magnet.postSignupMode === 'redirect') {
    return isSafePostSignupDestination(magnet.postSignupRedirectUrl)
      ? { kind: 'redirect', url: magnet.postSignupRedirectUrl }
      : { kind: 'message' };
  }

  if (magnet.postSignupMode === 'page') {
    return magnet.postSignupQuizEnabled && magnet.postSignupQuizQuestions.length > 0
      ? { kind: 'quiz' }
      : { kind: 'page' };
  }

  return { kind: 'message' };
}

export function postSignupVideoEmbedUrl(value: string) {
  if (!value) return '';

  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
      const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).at(-1);
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.hostname === 'loom.com' || url.hostname.endsWith('.loom.com')) {
      const id = url.pathname.split('/').filter(Boolean).at(-1);
      return id ? `https://www.loom.com/embed/${id}` : '';
    }
  } catch {
    return '';
  }

  return '';
}

export function postSignupVideoAutoplayUrl(value: string) {
  const embedUrl = postSignupVideoEmbedUrl(value);
  if (!embedUrl) return '';
  const url = new URL(embedUrl);
  url.searchParams.set('autoplay', '1');
  return url.toString();
}

export function postSignupVideoThumbnailUrl(value: string) {
  const embedUrl = postSignupVideoEmbedUrl(value);
  if (!embedUrl) return '';
  const url = new URL(embedUrl);
  if (url.hostname !== 'www.youtube.com') return '';
  const videoId = url.pathname.split('/').filter(Boolean).at(-1);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}
