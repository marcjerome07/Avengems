import { useEffect } from 'react';

export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | Avengems` : 'Avengems | Wear Your Stone';
  }, [title]);
}
