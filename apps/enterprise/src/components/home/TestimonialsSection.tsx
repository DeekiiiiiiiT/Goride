import { Star } from 'lucide-react';
import { TESTIMONIALS } from '@/lib/siteContent';

export function TestimonialsSection() {
  return (
    <section className="bg-surface py-20 md:py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight text-fleet-slate md:text-[2rem]">
          Trusted by Millions
        </h2>

        <div className="grid grid-cols-1 gap-[var(--spacing-gutter)] md:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <article
              key={testimonial.name}
              className="flex flex-col rounded-2xl border border-outline-variant bg-white p-8 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-1 text-secondary-container">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-current" aria-hidden />
                ))}
              </div>
              <p className="mb-8 flex-grow text-base italic text-on-surface">
                &ldquo;{testimonial.quote}&rdquo;
              </p>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-surface-container">
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div>
                  <p className="font-bold text-fleet-slate">{testimonial.name}</p>
                  <p className="text-xs text-on-surface-variant">{testimonial.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
