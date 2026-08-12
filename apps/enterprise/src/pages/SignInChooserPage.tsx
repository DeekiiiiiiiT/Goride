import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import {
  getSignInLines,
  type SignInLineId,
  type SignInProduct,
} from '@/lib/signInContent';

const LINE_IDS: SignInLineId[] = ['rideshare', 'delivery', 'enterprise'];

function isLineId(value: string | null): value is SignInLineId {
  return value !== null && (LINE_IDS as string[]).includes(value);
}

function ProductCard({ product }: { product: SignInProduct }) {
  return (
    <a
      href={product.href}
      className="group flex items-start justify-between gap-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 transition-all hover:border-fleet-slate/40 hover:shadow-md active:scale-[0.99] dark:bg-surface"
    >
      <div>
        <h3 className="text-lg font-semibold text-on-surface">{product.name}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{product.description}</p>
      </div>
      <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fleet-slate text-white transition-transform group-hover:translate-x-0.5">
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </a>
  );
}

export function SignInChooserPage() {
  const [params, setParams] = useSearchParams();
  const lineParam = params.get('line');
  const lines = getSignInLines();
  const activeLine = isLineId(lineParam) ? lines.find((l) => l.id === lineParam) : undefined;

  function selectLine(id: SignInLineId) {
    setParams({ line: id }, { replace: false });
  }

  function clearLine() {
    setParams({}, { replace: false });
  }

  return (
    <>
      <Header cta={{ label: 'Contact', href: '/contact' }} />
      <main
        id="main-content"
        className="relative min-h-[70vh] overflow-hidden bg-gradient-to-b from-surface-container-low via-surface to-surface-container-lowest dark:from-surface dark:via-surface dark:to-surface"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,_rgba(15,23,42,0.08),_transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06),_transparent_65%)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-[var(--spacing-margin-mobile)] py-14 md:px-[var(--spacing-margin-desktop)] md:py-20">
          {!activeLine ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                Sign in
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-fleet-slate dark:text-white md:text-4xl">
                Choose your product
              </h1>
              <p className="mt-3 max-w-xl text-base text-on-surface-variant">
                Pick a product line, then continue to that app’s own sign-in.
              </p>

              <div className="mt-10 grid gap-4">
                {lines.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => selectLine(line.id)}
                    className="group flex items-start justify-between gap-4 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-5 text-left transition-all hover:border-fleet-slate/40 hover:shadow-md active:scale-[0.99] dark:bg-surface"
                  >
                    <div>
                      <h2 className="text-xl font-semibold text-on-surface">{line.name}</h2>
                      <p className="mt-1 text-sm text-on-surface-variant">{line.description}</p>
                    </div>
                    <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fleet-slate text-white transition-transform group-hover:translate-x-0.5">
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={clearLine}
                className="inline-flex items-center gap-2 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                All product lines
              </button>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-fleet-slate dark:text-white md:text-4xl">
                {activeLine.name}
              </h1>
              <p className="mt-3 max-w-xl text-base text-on-surface-variant">
                {activeLine.description} Continue to the product you use.
              </p>

              <div className="mt-10 grid gap-4">
                {activeLine.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}

          <p className="mt-10 text-sm text-on-surface-variant">
            Looking for company info?{' '}
            <Link to="/" className="font-semibold text-fleet-slate underline-offset-2 hover:underline dark:text-white">
              Back to marketing site
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
