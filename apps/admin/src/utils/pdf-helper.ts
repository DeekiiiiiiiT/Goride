import * as pdfjsLib from 'pdfjs-dist';

// Initialize worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // Use esm.sh which is reliable in this environment
    // Use .mjs for newer versions of pdfjs-dist which are likely ESM
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export const convertPdfToImage = async (file: File): Promise<File | null> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        // Fetch the first page
        const page = await pdf.getPage(1);
        
        const scale = 2.0; // Higher scale for better OCR resolution
        const viewport = page.getViewport({ scale });

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return null;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;

        // Convert canvas to Blob/File
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    resolve(null);
                    return;
                }
                const imageFile = new File([blob], file.name.replace(/\.pdf$/i, '.png'), {
                    type: 'image/png'
                });
                resolve(imageFile);
            }, 'image/png');
        });

    } catch (error) {
        console.error("PDF to Image conversion failed:", error);
        return null;
    }
};
