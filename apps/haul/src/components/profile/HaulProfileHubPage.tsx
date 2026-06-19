import React from 'react';

type MenuItem = {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

type Props = {
  avatarUrl?: string;
  name: string;
  memberSince?: string;
  onEditPhoto?: () => void;
  onRatingClick?: () => void;
  sections: { title: string; items: MenuItem[] }[];
};

function MenuRow({ icon, label, onClick, danger }: MenuItem) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-[#2d3449]/50 active:bg-[#2d3449] ${
        danger ? 'hover:bg-[#93000a]/20' : ''
      }`}
    >
      <span
        className={`material-symbols-outlined transition-colors ${
          danger ? 'text-[#ffb4ab]' : 'text-[#d8c3ad] group-hover:text-[#ffc174]'
        }`}
      >
        {icon}
      </span>
      <span className={`flex-1 text-base ${danger ? 'text-[#ffb4ab]' : 'text-[#dae2fd]'}`}>{label}</span>
      {!danger ? <span className="material-symbols-outlined text-[#a08e7a]">chevron_right</span> : null}
    </button>
  );
}

export function HaulProfileHubPage({
  avatarUrl,
  name,
  memberSince,
  onEditPhoto,
  onRatingClick,
  sections,
}: Props) {
  const memberLabel = memberSince
    ? `Member since ${new Date(memberSince).toLocaleDateString([], { month: 'short', year: 'numeric' })}`
    : 'Member';

  return (
    <div className="-mx-4 flex flex-col">
      <section className="flex flex-col items-center border-b border-[#534434] px-4 py-8">
        <div className="relative mb-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-24 w-24 rounded-full border-2 border-[#ffc174] object-cover shadow-lg" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#ffc174] bg-[#2d3449] text-3xl font-bold text-[#ffc174]">
              {name.charAt(0)}
            </div>
          )}
          {onEditPhoto ? (
            <button
              type="button"
              onClick={onEditPhoto}
              className="absolute right-0 bottom-0 rounded-full border border-[#534434] bg-[#171f33] p-1.5 text-[#d8c3ad] hover:text-[#ffc174]"
              aria-label="Edit photo"
            >
              <span className="material-symbols-outlined text-base">edit</span>
            </button>
          ) : null}
        </div>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-[#dae2fd]">{name}</h2>
          <span className="flex items-center gap-1 rounded-full border border-[#ffc174]/30 bg-[#ffc174]/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#ffc174] uppercase">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
            Verified Pro
          </span>
        </div>
        <div className="mt-2 flex items-center gap-4 text-sm text-[#d8c3ad]">
          <button
            type="button"
            onClick={onRatingClick}
            className={`flex items-center gap-1 rounded-md bg-[#2d3449] px-2 py-1 transition-colors ${
              onRatingClick ? 'hover:bg-[#222a3d] hover:ring-1 hover:ring-[#ffc174]/30' : ''
            }`}
          >
            <span className="material-symbols-outlined text-base text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
              star
            </span>
            <span className="font-bold text-[#dae2fd]">4.8</span>
          </button>
          <span className="h-1 w-1 rounded-full bg-[#534434]" />
          <span>{memberLabel}</span>
        </div>
      </section>

      <nav className="flex flex-col py-2">
        {sections.map((section, idx) => (
          <div key={section.title}>
            {idx > 0 ? <div className="my-2 h-px bg-[#534434]/30" /> : null}
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-sm tracking-wider text-[#a08e7a] uppercase">{section.title}</h3>
            </div>
            {section.items.map((item) => (
              <MenuRow key={item.label} {...item} />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
