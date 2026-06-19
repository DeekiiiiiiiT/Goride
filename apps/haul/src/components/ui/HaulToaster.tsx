import { Toaster } from 'sonner';

export function HaulToaster() {
  return (
    <Toaster
      position="top-center"
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'bg-[#171f33] border border-[#534434] text-[#dae2fd] shadow-lg rounded-xl font-[Inter,sans-serif]',
          title: 'text-[#dae2fd] font-semibold',
          description: 'text-[#d8c3ad]',
          success: 'border-[#56e5a9]/40',
          error: 'border-[#ffb4ab]/40',
          info: 'border-[#7bd0ff]/40',
        },
      }}
    />
  );
}
