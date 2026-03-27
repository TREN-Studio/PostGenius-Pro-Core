
export const RECIPE_CARD_CSS = `
    .postgenius-recipe-card {
        font-family: var(--pgp-font-family, "Inter", sans-serif);
        background: #f3f4f6;
        border: 1px solid #d9dee6;
        border-top: 2px solid #f59e0b;
        border-radius: 8px;
        margin: 28px auto;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
        color: #374151;
        overflow: hidden;
    }

    .ac-header {
        text-align: center;
        padding: 20px 16px 14px;
        background-color: #f3f4f6;
        border-bottom: 1px dashed #cfd5de;
    }

    .ac-title-header {
        position: relative;
        padding-left: 14px;
        margin-bottom: 12px;
    }
    .ac-title-header::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 3px;
        height: 18px;
        background: #f59e0b;
        border-radius: 3px;
    }
    .ac-title-header h2 {
        margin: 0;
        font-size: 30px;
        color: #111827;
        font-family: var(--pgp-font-family, "Inter", sans-serif);
        font-weight: 800;
        line-height: 1.3;
    }

    .ac-meta-bar {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px 18px;
        font-size: 12px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-weight: 600;
    }
    .ac-meta-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .ac-meta-item strong {
        color: #f59e0b;
        font-weight: 800;
    }
    .ac-meta-value {
        color: #6b7280;
        font-weight: 700;
    }
    .ac-meta-icon {
        width: 12px;
        height: 12px;
        color: #7a6ea4;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .ac-meta-icon svg {
        width: 12px;
        height: 12px;
        display: block;
    }

    .ac-body {
        display: grid;
        grid-template-columns: 1fr;
    }
    @media (min-width: 768px) {
        .ac-body {
            grid-template-columns: 40% 1fr;
        }
    }

    .ac-ingredients {
        background-color: #f3f4f6;
        padding: 22px 16px 22px 22px;
        border-right: 1px solid #d8dde5;
        font-size: 14px;
    }
    .ac-ingredients h3 {
        font-size: 30px;
        margin-top: 0;
        margin-bottom: 14px;
        color: #1f2937;
        display: flex;
        align-items: center;
        gap: 8px;
        line-height: 1.1;
    }
    .ac-ingredients h3::before {
        content: "";
        width: 3px;
        height: 18px;
        border-radius: 3px;
        background: #f59e0b;
    }
    .ac-ingredients ul {
        padding: 0;
        margin: 0 0 20px 0;
        list-style: none;
    }
    .ac-ingredients li {
        margin-bottom: 10px;
        padding-left: 14px;
        position: relative;
        line-height: 1.5;
        color: #4b5563;
        font-size: 14px;
    }
    .ac-ingredients li::before {
        content: "\\2022";
        color: #f59e0b;
        font-weight: bold;
        font-size: 1em;
        position: absolute;
        left: 0;
        top: 0;
    }

    .ac-shop-container {
        margin-top: 18px;
        text-align: center;
    }
    .ac-shop-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: 100%;
        max-width: 220px;
        background-color: #fb923c;
        color: #fff !important;
        font-weight: 800;
        font-size: 13px;
        padding: 10px 10px;
        border-radius: 7px;
        text-decoration: none !important;
        transition: all 0.2s ease;
        box-shadow: 0 2px 5px rgba(15, 23, 42, 0.15);
        border: none;
        cursor: pointer;
        text-align: center;
    }
    .ac-btn-icon {
        width: 12px;
        height: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .ac-btn-icon svg {
        width: 12px;
        height: 12px;
        display: block;
    }
    .ac-shop-btn:hover {
        background-color: #f97316;
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
        color: #fff !important;
    }

    .ac-instructions {
        padding: 22px 20px;
        background-color: #f3f4f6;
    }
    .ac-instructions h3 {
        font-size: 30px;
        margin-top: 0;
        margin-bottom: 14px;
        color: #1f2937;
        display: flex;
        align-items: center;
        gap: 8px;
        line-height: 1.1;
    }
    .ac-instructions h3::before {
        content: "";
        width: 3px;
        height: 18px;
        border-radius: 3px;
        background: #f59e0b;
    }
    .ac-instructions ol {
        padding: 0;
        margin: 0;
        list-style: none;
        counter-reset: steps;
    }
    .ac-instructions li {
        position: relative;
        padding-left: 42px;
        margin-bottom: 18px;
        line-height: 1.65;
        color: #4b5563;
        font-size: 14px;
    }
    .ac-instructions li::before {
        counter-increment: steps;
        content: counter(steps);
        position: absolute;
        left: 0;
        top: 0;
        width: 30px;
        height: 30px;
        background-color: #fb923c;
        color: #fff;
        font-weight: bold;
        text-align: center;
        line-height: 30px;
        border-radius: 50%;
        font-size: 13px;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.16);
    }

    .ac-footer {
        border-top: 1px solid #d8dde5;
        padding: 10px 14px;
        background-color: #eceff3;
        display: flex;
        justify-content: flex-end;
        align-items: center;
    }
    .ac-print-btn {
        background: transparent;
        border: 1px solid #c9cfda;
        color: #6b7280;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .ac-print-icon {
        width: 12px;
        height: 12px;
        display: inline-flex;
        color: #7a6ea4;
    }
    .ac-print-icon svg {
        width: 12px;
        height: 12px;
        display: block;
    }
    .ac-print-btn:hover {
        background-color: #f8fafc;
        color: #4b5563;
        border-color: #bfc7d4;
    }
`;

export const PRODUCT_VERDICT_BOX_CSS = `
    .product-verdict-box {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 1.5rem;
        border: 2px solid #FDE68A; /* Subtle yellow/gold border */
        border-radius: 16px;
        background-color: #FFFBEB; /* Very light yellow background */
        margin: 2.5rem 0;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        position: relative;
        overflow: hidden;
    }
    .product-verdict-box:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    
    /* Ensure distinct look in dark mode contexts if needed */
    @media (prefers-color-scheme: dark) {
        .product-verdict-box {
             border-color: var(--pgp-primary-color);
             background-color: rgba(255, 255, 255, 0.05);
        }
    }

    .product-verdict-image {
        width: 180px;
        height: 180px;
        aspect-ratio: 1 / 1;
        background: #f3f4f6;
        border-radius: 12px;
        padding: 0;
        flex-shrink: 0;
        align-self: center;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 0 10px rgba(0,0,0,0.03);
        border: 1px solid rgba(0,0,0,0.05);
        overflow: hidden;
    }
    
    .product-verdict-image img {
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
        object-position: center center !important;
        display: block;
        background: #ffffff;
        padding: 0.45rem;
    }

    .product-verdict-content {
        flex-grow: 1;
        text-align: center;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    
    .product-verdict-content h4 {
        font-family: var(--pgp-font-family);
        font-size: 1.25rem;
        font-weight: 800;
        margin: 0 0 0.5rem 0;
        color: #111827; /* Always dark for contrast on light card */
        line-height: 1.4;
    }
    
    .product-verdict-content h4 a {
        text-decoration: none;
        color: inherit;
    }
    
    .product-verdict-price {
        font-size: 1.5rem;
        font-weight: 800;
        color: #059669; /* Green for price */
        margin-bottom: 0.5rem;
        display: block;
    }
    
    .product-verdict-content p {
        font-size: 0.95rem;
        line-height: 1.5;
        color: #4B5563;
        margin-bottom: 1.5rem;
    }

    .product-verdict-box .amazon-cta-button {
      display: inline-block;
      padding: 0.92rem 1.35rem;
      font-weight: 700;
      border-radius: 999px;
      color: #3f2602 !important;
      text-decoration: none !important;
      background: linear-gradient(180deg, #ffd66e 0%, #f7b733 52%, #eea91d 100%);
      border: 1px solid #d69b1b;
      box-shadow: 0 10px 22px rgba(247, 183, 51, 0.28), inset 0 1px 0 rgba(255,255,255,0.65);
      transition: all 0.22s ease;
      cursor: pointer;
      width: 100%;
      text-align: center;
      font-size: 0.96rem;
      letter-spacing: 0.01em;
    }
    
    .product-verdict-box .amazon-cta-button:hover {
        background: linear-gradient(180deg, #ffe08f 0%, #f8c14f 52%, #f0aa17 100%);
        transform: translateY(-2px);
        box-shadow: 0 14px 26px rgba(247, 183, 51, 0.32), inset 0 1px 0 rgba(255,255,255,0.7);
    }
    .amazon-reviews-section {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        margin: 1.5rem 0 2.75rem;
    }
    .amazon-review-card {
        display: flex;
        flex-direction: column;
        gap: 1.05rem;
        border: 1px solid #e5dccd;
        border-top: 3px solid #f7b733;
        border-radius: 0;
        padding: 1.2rem 1.2rem 1.45rem;
        background: #fffdf9;
        box-shadow: none;
    }
    .amazon-review-heading-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.85rem;
        margin-bottom: 0.25rem;
    }
    .amazon-review-image-wrap {
        border-radius: 0;
        overflow: hidden;
        background: #f7f2ea;
        border: 1px solid #e8dece;
        aspect-ratio: 16 / 10;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
    }
    .amazon-review-image-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        border-radius: 0;
        background: #ffffff;
    }
    .amazon-review-title {
        margin: 0;
        color: #111827;
        font-size: 1.28rem;
        line-height: 1.32;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .amazon-review-title-accent {
        display: inline-block;
        width: 3px;
        min-width: 3px;
        align-self: stretch;
        border-radius: 999px;
        background: #f59e0b;
    }
    .amazon-review-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.26rem 0.62rem;
        border-radius: 999px;
        background: #fff4d6;
        color: #8a5a00;
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border: 1px solid #f6d48c;
        white-space: nowrap;
    }
    .amazon-review-body {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }
    .amazon-review-summary {
        margin: 0;
        color: #475569;
        font-size: 1rem;
        line-height: 1.84;
    }
    .amazon-review-price {
        color: #b45309;
        font-weight: 900;
        font-size: 1rem;
        margin: 0;
    }
    .amazon-key-features {
        margin: 0;
        background: #fffaf0;
        border: 1px solid #f3e2bb;
        border-radius: 0;
        padding: 0.9rem 1rem;
    }
    .amazon-key-features h4 {
        margin: 0 0 0.45rem 0;
        color: #7c2d12;
        font-size: 0.92rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .amazon-key-features ul {
        margin: 0;
        padding-left: 1.1rem;
        color: #475569;
    }
    .amazon-key-features li {
        margin-bottom: 0.28rem;
        line-height: 1.65;
    }
    .pros-cons-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.85rem;
        margin: 0;
    }
    .pros-box, .cons-box {
        border: 1px solid #ece2d5;
        border-radius: 0;
        padding: 0.9rem 1rem;
    }
    .pros-box {
        background: #f8fbf6;
        border-color: #d7e5cf;
    }
    .cons-box {
        background: #fcf8f4;
        border-color: #ecd9c9;
    }
    .pros-box h4, .cons-box h4 {
        margin: 0 0 0.45rem 0;
        color: #111827;
        font-size: 0.92rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .pros-box ul, .cons-box ul {
        list-style: none;
        margin: 0;
        padding-left: 0;
    }
    .pros-box li, .cons-box li {
        margin-bottom: 0.34rem;
        position: relative;
        padding-left: 1.2rem;
        color: #475569;
        line-height: 1.65;
    }
    .pros-box li::before {
        content: "\\2713";
        color: #16a34a;
        position: absolute;
        left: 0;
        top: 0;
        font-weight: 700;
    }
    .cons-box li::before {
        content: "\\2715";
        color: #dc2626;
        position: absolute;
        left: 0;
        top: 0;
        font-weight: 700;
    }
    .amazon-review-tradeoff {
        margin: 0;
        color: #475569;
        font-size: 0.96rem;
        line-height: 1.75;
    }
    .amazon-review-tradeoff strong {
        color: #111827;
    }
    .amazon-review-cta-wrap {
        display: flex;
        justify-content: center;
        padding-top: 0.2rem;
    }
    .amazon-review-cta-wrap .amazon-cta-button-full {
        width: auto;
        min-width: 196px;
        padding-left: 1.2rem;
        padding-right: 1.2rem;
    }

    .amazon-comparison-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.05rem;
        margin: 1.25rem 0 2rem;
        padding-bottom: 0.6rem;
        align-items: stretch;
    }
    .amazon-compare-card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.45rem;
        text-align: left;
        border: 1px solid #dfd6c8;
        border-top: 3px solid #f7b733;
        border-radius: 0;
        padding: 0.95rem 0.9rem;
        background: #fffdf8;
        height: 100%;
        position: relative;
        box-shadow: none;
    }
    .amazon-compare-badge {
        position: static;
        align-self: flex-start;
        padding: 0.18rem 0.45rem;
        border-radius: 999px;
        background: #fff4d6;
        color: #8a5a00;
        border: 1px solid #f6d48c;
        font-size: 0.64rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 0.15rem;
    }
    .amazon-compare-image-box {
        background: #f7f2ea;
        border: 1px solid #e8dece;
        border-radius: 0;
        width: 100%;
        aspect-ratio: 1 / 1;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 0.35rem;
        overflow: hidden;
    }
    .amazon-comparison-grid .comparison-thumb {
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center center;
        border-radius: 0;
        background: #ffffff;
        border: 0;
        margin-bottom: 0;
        max-height: 100%;
        padding: 0.4rem;
    }
    .amazon-compare-title {
        margin: 0;
        color: #1e293b;
        font-size: .92rem;
        font-weight: 800;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 2.8em;
        position: relative;
        padding-left: 0.55rem;
    }
    .amazon-compare-title::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.1rem;
        width: 3px;
        height: 1.1rem;
        border-radius: 999px;
        background: #f59e0b;
    }
    .amazon-compare-price {
        margin: 0;
        color: #b45309;
        font-size: 1rem;
        font-weight: 900;
    }
    .amazon-compare-description,
    .product-verdict-description {
        margin: 0.05rem 0 0.2rem;
        color: #5b6475;
        font-size: 0.82rem;
        line-height: 1.55;
    }
    .amazon-compare-description {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 3.8em;
    }
    .amazon-compare-features {
        margin: 0.05rem 0 0.35rem;
        padding-left: 1rem;
        color: #64748b;
        font-size: 0.75rem;
        line-height: 1.42;
        min-height: 2.2rem;
    }
    .amazon-compare-features li {
        margin-bottom: 0.18rem;
    }
    .amazon-compare-rating {
        margin: 0 0 .5rem 0;
        font-size: .85rem;
        color: #475569;
    }
    .amazon-table-cta-button,
    .amazon-cta-button-full {
        display: inline-block;
        width: 100%;
        text-align: center;
        padding: .82rem 1rem;
        border-radius: 999px;
        color: #3f2602 !important;
        text-decoration: none !important;
        background: linear-gradient(180deg, #ffd66e 0%, #f7b733 52%, #eea91d 100%);
        border: 1px solid #d69b1b;
        font-weight: 800;
        font-size: .84rem;
        white-space: nowrap;
        transition: all .22s ease;
        margin-top: auto;
        box-shadow: 0 10px 22px rgba(247, 183, 51, 0.28), inset 0 1px 0 rgba(255,255,255,0.65);
        letter-spacing: 0.01em;
    }
    .amazon-table-cta-button:hover,
    .amazon-cta-button-full:hover {
        background: linear-gradient(180deg, #ffe08f 0%, #f8c14f 52%, #f0aa17 100%);
        transform: translateY(-2px);
        box-shadow: 0 14px 26px rgba(247, 183, 51, 0.32), inset 0 1px 0 rgba(255,255,255,0.7);
    }
    @media (min-width: 768px) {
        .product-verdict-box {
            flex-direction: row;
            align-items: flex-start; /* Align top */
            text-align: left;
            padding: 2rem;
        }
        .product-verdict-content {
            text-align: left;
            padding-left: 1rem;
            justify-content: flex-start;
        }
        .product-verdict-box .amazon-cta-button {
            width: auto;
            display: inline-block;
        }
        .pros-cons-grid {
            grid-template-columns: 1fr 1fr;
        }
        .amazon-comparison-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1.25rem;
        }
        .amazon-review-title {
            font-size: 1.34rem;
        }
    }
    @media (max-width: 767px) {
        .amazon-review-heading-row {
            flex-direction: column;
            align-items: flex-start;
        }
        .amazon-review-card {
            padding: 1rem;
        }
    }
`;

export const FAQ_SECTION_CSS = `
    .postgenius-faq-section {
        margin: 2rem 0;
        background: #f5f7fb;
        border-radius: 8px;
        padding: 1.25rem;
        border: 1px solid #d9dee8;
    }
    .postgenius-faq-section h2 {
        text-align: center;
        margin-bottom: 1.25rem !important;
        color: #1f2937;
        font-size: 1.35rem;
        position: relative;
        display: inline-block;
        left: 50%;
        transform: translateX(-50%);
    }
    .postgenius-faq-section h2::after {
        content: '';
        display: block;
        width: 38px;
        height: 2px;
        background-color: #fdc754;
        margin: 8px auto 0;
        border-radius: 2px;
    }
    .faq-item {
        margin-bottom: 0.65rem;
        background: #fff;
        border-radius: 6px;
        padding: 0.8rem 0.9rem;
        border: 1px solid #d6dbe4;
        box-shadow: none;
        transition: background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
    }
    .faq-item:hover {
        border-color: #c8d0dd;
    }
    .faq-item[open] {
        background: #fff8e8;
        border-color: #fdc754;
        box-shadow: 0 0 0 1px rgba(253, 199, 84, .2) inset;
    }
    .faq-item:last-child {
        margin-bottom: 0;
    }

    .faq-item summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        outline: none;
    }
    .faq-item summary::-webkit-details-marker {
        display: none;
    }

    .faq-question {
        font-weight: 700;
        font-size: 1.06rem;
        color: #1f2937;
        margin-bottom: 0;
        line-height: 1.55;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }
    .faq-question::after {
        content: '+';
        color: #fdc754;
        font-size: 1rem;
        font-weight: 900;
        flex-shrink: 0;
    }
    .faq-item[open] .faq-question::after {
        content: '−';
    }

    .faq-answer {
        color: #334155;
        font-size: 0.98rem;
        line-height: 1.75;
        margin-top: 0.6rem;
    }

    @media (max-width: 768px) {
        .postgenius-faq-section {
            padding: 1rem;
        }
        .faq-item {
            padding: 0.85rem 0.85rem;
        }
        .faq-question {
            font-size: 1rem;
            line-height: 1.5;
        }
        .faq-answer {
            font-size: 0.95rem;
            line-height: 1.68;
        }
    }
`;

export const MAIN_CTA_BUTTON_CSS = `
    .cta-container {
        text-align: center;
        margin: 3rem 0;
        padding: 2.5rem;
        background: var(--pgp-secondary-bg);
        border: 1px dashed var(--pgp-primary-color);
        border-radius: 16px;
    }
    .pgp-cta-button {
        display: inline-block;
        background-color: var(--pgp-primary-color); /* User Primary Color */
        color: #fff !important;
        font-family: var(--pgp-font-family, 'Inter', sans-serif);
        font-weight: 800;
        padding: 1.2rem 3.5rem;
        border-radius: 9999px;
        text-decoration: none !important;
        transition: all 0.3s ease;
        border: none;
        font-size: 1.3rem;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .pgp-cta-button:hover {
        transform: translateY(-3px) scale(1.02);
        box-shadow: 0 12px 25px rgba(0, 0, 0, 0.25);
        filter: brightness(1.1);
    }
`;



