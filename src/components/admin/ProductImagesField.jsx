import { useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, GripVertical, ImagePlus, RotateCw, X } from 'lucide-react';
import { IMAGE_ACCEPT, IMAGE_RULES } from '../../services/productImageService';

/** Drop zone + ordered thumbnails. The first image is the cover. */
export default function ProductImagesField({ images, productName = 'product' }) {
  const { items, notices, dismissNotices, addFiles, retry, remove, move } = images;
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  // Reordering thumbnails by drag; the arrow buttons do the same for keyboard users.
  const [draggedKey, setDraggedKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  function endReorder() {
    setDraggedKey(null);
    setOverKey(null);
  }

  function dropOn(targetIndex) {
    if (draggedKey) move(draggedKey, targetIndex);
    endReorder();
  }
  const hintId = useId();
  const coverKey = items.find((item) => item.status !== 'error')?.key;
  const full = items.filter((item) => item.status !== 'error').length >= IMAGE_RULES.maxImages;

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (draggedKey) return; // a thumbnail being reordered, not a file
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  }

  return (
    <fieldset className="span-2 pimg">
      <legend className="field__label">Images</legend>
      <div
        className={`pimg__drop ${dragging ? 'is-dragging' : ''} ${full ? 'is-full' : ''}`}
        onDragOver={(event) => { event.preventDefault(); if (!draggedKey) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <ImagePlus size={22} strokeWidth={1.4} aria-hidden="true" />
        <p className="pimg__drop-text">
          Drag images here or{' '}
          <button type="button" className="pimg__browse" onClick={() => inputRef.current?.click()} aria-describedby={hintId}>
            browse
          </button>
        </p>
        <p className="field__hint" id={hintId}>JPG, PNG or WebP · up to 5 MB · max 5 images</p>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
        />
      </div>

      {notices.length > 0 && (
        <div className="pimg__notices" role="alert">
          <ul>{notices.map((notice) => <li key={notice}>{notice}</li>)}</ul>
          <button type="button" className="pimg__link" onClick={dismissNotices}>Dismiss</button>
        </div>
      )}

      {items.length > 0 && (
        <ol className="pimg__grid" aria-label="Product images in display order, first is the main image">
          {items.map((item, index) => {
            const label = `Image ${index + 1} of ${productName}`;
            const reorderable = item.status !== 'error';
            return (
              <li
                key={item.key}
                className={`pimg__item is-${item.status} ${draggedKey === item.key ? 'is-dragged' : ''} ${overKey === item.key && draggedKey !== item.key ? 'is-drop-target' : ''}`}
                draggable={reorderable}
                onDragStart={(event) => {
                  setDraggedKey(item.key);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.key);
                }}
                onDragOver={(event) => {
                  if (!draggedKey) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setOverKey(item.key);
                }}
                onDrop={(event) => {
                  if (!draggedKey) return;
                  event.preventDefault();
                  event.stopPropagation();
                  dropOn(index);
                }}
                onDragEnd={endReorder}
              >
                <div className="pimg__thumb">
                  {item.url ? <img src={item.url} alt={label} draggable={false} /> : <span className="pimg__empty" aria-hidden="true" />}
                  {item.key === coverKey && <span className="pimg__cover">Main</span>}
                  {reorderable && (
                    <span className="pimg__grip" aria-hidden="true" title="Drag to reorder">
                      <GripVertical size={14} />
                    </span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="pimg__progress" role="progressbar" aria-label={`Uploading ${label}`}
                      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
                      <span style={{ width: `${Math.max(4, item.progress * 100)}%` }} />
                    </span>
                  )}
                  <button type="button" className="pimg__remove" onClick={() => remove(item.key)} aria-label={`Remove ${label}`}>
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
                {item.status === 'error' ? (
                  <div className="pimg__error">
                    <p className="field__error">{item.error}</p>
                    {item.file && (
                      <button type="button" className="pimg__link" onClick={() => retry(item.key)}>
                        <RotateCw size={12} aria-hidden="true" /> Retry
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="pimg__actions">
                    <button type="button" className="pimg__icon" disabled={index === 0} onClick={() => move(item.key, index - 1)} aria-label={`Move ${label} earlier`}>
                      <ArrowLeft size={14} />
                    </button>
                    {item.key === coverKey ? (
                      <span className="pimg__status">{item.status === 'uploading' ? 'Uploading…' : 'Main image'}</span>
                    ) : (
                      <button type="button" className="pimg__link" onClick={() => move(item.key, 0)} aria-label={`Set ${label} as main image`}>
                        Set as main image
                      </button>
                    )}
                    <button type="button" className="pimg__icon" disabled={index === items.length - 1} onClick={() => move(item.key, index + 1)} aria-label={`Move ${label} later`}>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </fieldset>
  );
}
