'use client';

import { arrow, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom';
import type { Placement } from '@floating-ui/react-dom';
import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type TooltipKey, useOnboarding } from '@/context/OnboardingContext';


interface OnboardingTooltipProps {
    /** Onboarding flag this tooltip is keyed to. Visibility ("not seen yet")
     * and dismissal (mark seen, including when the target itself is clicked)
     * are derived from it, so call sites don't wire up the onboarding
     * context themselves. */
    tooltipKey: TooltipKey;
    targetRef: React.RefObject<HTMLElement | HTMLButtonElement | null>;
    title?: string;
    message: string;
    /** Extra gating beyond "not seen yet" (e.g. panel open, data loaded). */
    enabled?: boolean;
    onNext?: () => void;
    showNext?: boolean;
    /** Preferred side relative to the target. Defaults to bottom. */
    placement?: Placement;
}

export const OnboardingTooltip = ({
    tooltipKey,
    targetRef,
    title = 'One more thing...',
    message,
    enabled = true,
    onNext,
    showNext = true,
    placement: preferredPlacement = 'bottom',
}: OnboardingTooltipProps) => {
    const { hasSeenTooltip, markTooltipSeen } = useOnboarding();
    const arrowRef = useRef<HTMLDivElement>(null);
    const messageId = useId();
    const [mounted, setMounted] = useState(false);

    const isVisible = enabled && !hasSeenTooltip(tooltipKey);
    const dismiss = useCallback(() => markTooltipSeen(tooltipKey), [markTooltipSeen, tooltipKey]);

    const { refs, floatingStyles, middlewareData, placement, isPositioned, elements } = useFloating({
        placement: preferredPlacement,
        strategy: 'fixed',
        open: isVisible,
        // Tracks the target through scrolling (including nested overflow
        // containers), resizes, and layout shifts.
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(12),
            flip({ padding: 16, fallbackAxisSideDirection: 'start' }),
            shift({ padding: 16 }),
            arrow({ element: arrowRef, padding: 12 }),
        ],
    });

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Adopt the target as the floating reference on every render: a ref prop
    // can't trigger effects when its element mounts late or remounts, and
    // setReference bails out when the element is unchanged.
    useEffect(() => {
        refs.setReference(targetRef.current);
    });

    // While pointing at the target: pulsate it, link it to the message for
    // screen readers, and treat a click on it as "seen".
    useEffect(() => {
        const target = elements.reference;
        if (!isVisible || !(target instanceof HTMLElement)) return;

        target.classList.add('onboarding-pulse');
        target.setAttribute('aria-describedby', messageId);
        target.addEventListener('click', dismiss);
        return () => {
            target.classList.remove('onboarding-pulse');
            target.removeAttribute('aria-describedby');
            target.removeEventListener('click', dismiss);
        };
    }, [isVisible, elements.reference, dismiss, messageId]);

    useEffect(() => {
        if (!isVisible) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') dismiss();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isVisible, dismiss]);

    if (!mounted || !isVisible) return null;

    // Actual side after flip(), used only for arrow placement (not transforms).
    const side = placement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
    const staticSide = (
        {
            top: 'bottom',
            bottom: 'top',
            left: 'right',
            right: 'left',
        } as const
    )[side];

    const tooltipContent = (
        <div
            ref={refs.setFloating}
            className="z-[200] pointer-events-auto"
            style={{
                ...floatingStyles,
                // Avoid a flash at (0,0) before the first position resolves.
                visibility: isPositioned ? 'visible' : 'hidden',
            }}
        >
            {/*
              Keep enter animations on an INNER node. slide-in-* / zoom-*
              animations apply CSS transforms that fight floating-ui's
              positioning transform on the outer node — which visually offsets
              the dialog from its real click hitbox (buttons look unclickable).
            */}
            <div className="relative animate-in fade-in duration-200">
                {/* Arrow pointing at the target; never intercept clicks. */}
                <div
                    ref={arrowRef}
                    className="absolute h-3.5 w-3.5 rotate-45 bg-blue-500 pointer-events-none"
                    style={{
                        left: middlewareData.arrow?.x != null ? `${middlewareData.arrow.x}px` : '',
                        top: middlewareData.arrow?.y != null ? `${middlewareData.arrow.y}px` : '',
                        [staticSide]: '-7px',
                        boxShadow: '-1px -1px 2px rgba(0, 0, 0, 0.08)',
                    }}
                />

                <div
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={`${messageId}-title`}
                    className="relative bg-blue-500 text-white rounded-lg shadow-2xl p-5 max-w-sm"
                >
                    <button
                        type="button"
                        onClick={dismiss}
                        className="absolute top-1.5 right-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-blue-600 transition-colors cursor-pointer"
                        aria-label="Close tooltip"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    <h3 id={`${messageId}-title`} className="text-base font-semibold mb-2 pr-8">
                        {title}
                    </h3>

                    <p id={messageId} className="text-sm leading-relaxed mb-4 pr-2">
                        {message}
                    </p>

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={dismiss}
                            className="bg-white text-blue-600 min-h-9 px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                            Close
                        </button>

                        {showNext && (
                            <button
                                type="button"
                                onClick={() => {
                                    onNext?.();
                                    dismiss();
                                }}
                                className="bg-white text-blue-600 min-h-9 px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                                Next
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // Use portal to render tooltip at document root
    return createPortal(tooltipContent, document.body);
};
