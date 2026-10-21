import { h, render } from 'preact';
import { courseSchema } from '@novoapps/content-model';
import { CourseViewer } from '../../../newvines-learning/src/components/CourseViewer';
import '../../../newvines-learning/src/styles.css';

const cmsOrigin = new URL(import.meta.env.VITE_CMS_ORIGIN || 'http://127.0.0.1:5174').origin;
let revision = 0;
// This preview entry deliberately does not import Learning/main.tsx or register a worker.
// The iframe uses the actual lesson renderer, isolated from the React administration UI.
window.addEventListener('message', event => {
  if (event.origin !== cmsOrigin || event.source !== window.parent || event.data?.type !== 'NOVOAPPS_CMS_PREVIEW') return;
  const parsed = courseSchema.safeParse(event.data.course);
  if (!parsed.success || !['self-paced', 'guided'].includes(event.data.mode) ||
    !parsed.data.module.pages.some(page => page.id === event.data.pageId)) return;
  history.replaceState(null, '', location.pathname + '#' + event.data.pageId);
  const mount = document.getElementById('app')!;
  if (revision === 0) mount.replaceChildren();
  render(h(CourseViewer, { key: ++revision, course: parsed.data, initialMode: event.data.mode }), mount);
});
