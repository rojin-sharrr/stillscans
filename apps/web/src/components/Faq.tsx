import { useState } from "preact/hooks";

/** One item open at a time. Closed answers stay in the HTML so crawlers can read them. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);

  return (
    <div class="faq">
      {items.map((item, index) => {
        const isOpen = index === open;
        return (
          <div class="faq__item" key={item.q}>
            <h3>
              <button
                type="button"
                class="faq__q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : index)}
              >
                <span>{item.q}</span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#5B6170"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </h3>
            <p class="faq__a" hidden={!isOpen}>
              {item.a}
            </p>
          </div>
        );
      })}
    </div>
  );
}
