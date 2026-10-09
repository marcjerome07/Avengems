import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import { StoneGem } from '../components/product/CollectionCard';
import './InfoPage.css';

export default function NotFound() {
  return (
    <PageContainer title="Page not found">
      <section className="not-found">
        <span className="not-found__gem" aria-hidden="true">
          <StoneGem stone="space" size={90} />
        </span>
        <p className="not-found__code">ERROR 404</p>
        <h1 className="not-found__title">This page has wandered off.</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back to the stones.</p>
        <div className="not-found__actions">
          <Button to="/">Back to home</Button>
          <Button to="/shop" variant="outline">
            Browse the shop
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
