import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IMAGE_RULES,
  checkImageFile,
  discardImages,
  imageSourcesOf,
  prepareImage,
  requestUploadUrl,
  uploadToSignedUrl,
} from '../services/productImageService';

let nextKey = 0;
const key = () => `img-${++nextKey}`;

/**
 * Image state for the product form. Saved images change only when the form is saved;
 * uploads made in this form are discarded if it closes without saving them.
 * Item: { key, source, url, status: 'saved' | 'uploading' | 'ready' | 'error', progress, error, file }
 */
export default function useProductImages(initialSources = [], productId) {
  const [items, setItems] = useState(() =>
    initialSources.map(({ source, url }) => ({ key: key(), source, url, status: 'saved', progress: 1, error: '', file: null })),
  );
  const [notices, setNotices] = useState([]);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const pending = useRef(new Set()); // paths issued to this form and not yet saved
  const controllers = useRef(new Map());
  const previews = useRef(new Set());

  const patch = (itemKey, values) => setItems((list) => list.map((item) => (item.key === itemKey ? { ...item, ...values } : item)));

  const upload = useCallback(async (itemKey, file) => {
    const controller = new AbortController();
    controllers.current.set(itemKey, controller);
    patch(itemKey, { status: 'uploading', progress: 0, error: '', source: null });
    try {
      const { blob, type } = await prepareImage(file);
      const others = itemsRef.current.filter((item) => item.key !== itemKey && item.status !== 'error').length;
      const ticket = await requestUploadUrl({
        ...(productId ? { productId } : {}),
        fileName: `image.${IMAGE_RULES.types[type]}`,
        contentType: type,
        size: blob.size,
        count: others,
      });
      pending.current.add(ticket.path);
      if (controller.signal.aborted) return;
      await uploadToSignedUrl(ticket.signedUrl, blob, ticket.contentType, {
        signal: controller.signal,
        onProgress: (progress) => patch(itemKey, { progress }),
      });
      if (!controller.signal.aborted) patch(itemKey, { status: 'ready', progress: 1, source: ticket.path });
    } catch (error) {
      if (!controller.signal.aborted) patch(itemKey, { status: 'error', error: error.message || 'The upload failed.' });
    } finally {
      controllers.current.delete(itemKey);
    }
  }, [productId]);

  const addFiles = useCallback(async (fileList) => {
    const files = [...fileList];
    const problems = [];
    let room = IMAGE_RULES.maxImages - itemsRef.current.filter((item) => item.status !== 'error').length;
    for (const file of files) {
      const problem = await checkImageFile(file);
      if (problem) { problems.push(problem); continue; }
      if (room <= 0) { problems.push(`${file.name} wasn't added: a product can have at most ${IMAGE_RULES.maxImages} images.`); continue; }
      room -= 1;
      const url = URL.createObjectURL(file);
      previews.current.add(url);
      const item = { key: key(), source: null, url, status: 'uploading', progress: 0, error: '', file };
      setItems((list) => [...list, item]);
      itemsRef.current = [...itemsRef.current, item];
      upload(item.key, file);
    }
    setNotices(problems);
  }, [upload]);

  const retry = useCallback((itemKey) => {
    const item = itemsRef.current.find((entry) => entry.key === itemKey);
    if (item?.file) upload(itemKey, item.file);
  }, [upload]);

  const remove = useCallback((itemKey) => {
    const item = itemsRef.current.find((entry) => entry.key === itemKey);
    if (!item) return;
    controllers.current.get(itemKey)?.abort();
    setItems((list) => list.filter((entry) => entry.key !== itemKey));
    // Unsaved uploads are deleted now; saved images are only deleted on save.
    if (item.source && pending.current.has(item.source)) {
      pending.current.delete(item.source);
      discardImages([item.source]).catch(() => pending.current.add(item.source));
    }
  }, []);

  const move = useCallback((itemKey, to) => setItems((list) => {
    const from = list.findIndex((item) => item.key === itemKey);
    if (from < 0 || to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  }), []);

  /** Call after a successful save: those uploads now belong to the product. */
  const commit = useCallback((sources) => { for (const source of sources) pending.current.delete(source); }, []);

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
    const paths = [...pending.current];
    pending.current.clear();
    discardImages(paths).catch(() => {});
    for (const url of previews.current) URL.revokeObjectURL(url);
  }, []);

  return {
    items,
    notices,
    dismissNotices: () => setNotices([]),
    addFiles,
    retry,
    remove,
    move,
    commit,
    uploading: items.some((item) => item.status === 'uploading'),
    sources: imageSourcesOf(items),
  };
}
