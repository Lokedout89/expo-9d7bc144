import React from 'react';
function ensureUnit(value) {
    const trimmedValue = String(value).trim();
    if (trimmedValue.endsWith('%')) {
        return trimmedValue;
    }
    return `${trimmedValue}px`;
}
function getObjectPositionFromContentPositionObject(contentPosition) {
    const resolvedPosition = { ...contentPosition };
    if (!resolvedPosition) {
        return '50% 50%';
    }
    if (resolvedPosition.top == null && resolvedPosition.bottom == null) {
        resolvedPosition.top = '50%';
    }
    if (resolvedPosition.left == null && resolvedPosition.right == null) {
        resolvedPosition.left = '50%';
    }
    return (['top', 'bottom', 'left', 'right']
        .map((key) => {
        if (key in resolvedPosition) {
            return `${key} ${ensureUnit(resolvedPosition[key])}`;
        }
        return '';
    })
        .join(' ') || '50% 50%');
}
function useImageState(source) {
    const hasAnySource = source && source.length > 0;
    const [imageState, setImageState] = React.useState(hasAnySource ? 'loading' : 'empty');
    React.useEffect(() => {
        setImageState((prevState) => prevState === 'empty' ? (hasAnySource ? 'loading' : 'empty') : prevState);
    }, [hasAnySource]);
    const onLoad = React.useCallback(() => setImageState((prevState) => (imageState === 'loading' ? 'loaded' : prevState)), []);
    const handlers = React.useMemo(() => ({
        onLoad,
    }), [onLoad]);
    return [imageState, handlers];
}
function useTransition(transition, state) {
    if (!transition) {
        return { placeholder: {}, image: {} };
    }
    const { duration, timing, effect } = {
        timing: 'ease-in-out',
        effect: 'cross-dissolve',
        duration: 1000,
        ...transition,
    };
    if (effect === 'cross-dissolve') {
        const commonStyles = {
            transition: `opacity ${duration}ms`,
            transitionTimingFunction: timing,
        };
        return {
            image: {
                opacity: state === 'loaded' ? '1' : '0',
                ...commonStyles,
            },
            placeholder: {
                opacity: state === 'loaded' ? '0' : '1',
                ...commonStyles,
            },
        };
    }
    if (effect === 'flip-from-top') {
        const commonStyles = {
            transition: `transform ${duration}ms`,
            transformOrigin: 'top',
            transitionTimingFunction: timing,
        };
        return {
            placeholder: {
                transform: `rotateX(${state !== 'loaded' ? '0' : '90deg'})`,
                ...commonStyles,
            },
            image: {
                transform: `rotateX(${state === 'loaded' ? '0' : '90deg'})`,
                ...commonStyles,
            },
        };
    }
    return { placeholder: {}, image: {} };
}
function findBestSourceForSize(sources, size) {
    return ([...(sources || [])]
        // look for the smallest image that's still larger then a container
        ?.map((source) => {
        if (!size) {
            return { source, penalty: 0, covers: false };
        }
        const { width, height } = typeof source === 'object' ? source : { width: null, height: null };
        if (width == null || height == null) {
            return { source, penalty: 0, covers: false };
        }
        if (width < size.width || height < size.height) {
            return {
                source,
                penalty: Math.max(size.width - width, size.height - height),
                covers: false,
            };
        }
        return { source, penalty: (width - size.width) * (height - size.height), covers: true };
    })
        .sort((a, b) => a.penalty - b.penalty)
        .sort((a, b) => Number(b.covers) - Number(a.covers))[0]?.source ?? null);
}
function useSourceSelection(sources, sizeCalculation = 'live') {
    const hasMoreThanOneSource = (sources?.length ?? 0) > 1;
    // null - not calculated yet, DOMRect - size available
    const [size, setSize] = React.useState(null);
    const resizeObserver = React.useRef(null);
    React.useEffect(() => {
        return () => {
            resizeObserver.current?.disconnect();
        };
    }, []);
    const containerRef = React.useCallback((element) => {
        if (!hasMoreThanOneSource) {
            return;
        }
        setSize(element?.getBoundingClientRect());
        if (sizeCalculation === 'live') {
            resizeObserver.current?.disconnect();
            if (!element) {
                return;
            }
            resizeObserver.current = new ResizeObserver((entries) => {
                setSize(entries[0].contentRect);
            });
            resizeObserver.current.observe(element);
        }
    }, [hasMoreThanOneSource, sizeCalculation]);
    const bestSourceForSize = size !== undefined ? findBestSourceForSize(sources, size) : null;
    const source = (hasMoreThanOneSource ? bestSourceForSize : sources?.[0]) ?? null;
    return React.useMemo(() => ({
        containerRef,
        source,
    }), [source]);
}
function getFetchPriorityFromImagePriority(priority = 'normal') {
    return priority && ['low', 'high'].includes(priority) ? priority : 'auto';
}
function Image({ source, events, contentPosition, priority, style, }) {
    const objectPosition = getObjectPositionFromContentPositionObject(contentPosition);
    const { uri = undefined } = source ?? {};
    return (React.createElement("img", { src: uri || undefined, style: {
            width: '100%',
            height: '100%',
            position: 'absolute',
            left: 0,
            right: 0,
            objectPosition,
            ...style,
        }, 
        // @ts-ignore
        // eslint-disable-next-line react/no-unknown-property
        fetchpriority: getFetchPriorityFromImagePriority(priority), onLoad: (event) => events?.onLoad.forEach((e) => e?.(event)), onError: () => events?.onError.forEach((e) => e?.({ source })) }));
}
function onLoadAdapter(onLoad) {
    return (event) => {
        const target = event.target;
        onLoad?.({
            source: {
                url: target.currentSrc,
                width: target.naturalWidth,
                height: target.naturalHeight,
                mediaType: null,
            },
            cacheType: 'none',
        });
    };
}
function onErrorAdapter(onError) {
    return ({ source }) => {
        onError?.({
            error: `Failed to load image from url: ${source?.uri}`,
        });
    };
}
export default function ExpoImage({ source, placeholder, contentFit, contentPosition, onLoad, transition, onError, responsivePolicy, onLoadEnd, priority, ...props }) {
    const { aspectRatio, backgroundColor, transform, borderColor, ...style } = props.style ?? {};
    const [state, handlers] = useImageState(source);
    const { placeholder: placeholderStyle, image: imageStyle } = useTransition(transition, state);
    const { containerRef, source: selectedSource } = useSourceSelection(source, responsivePolicy);
    return (React.createElement("div", { ref: containerRef, style: {
            aspectRatio: String(aspectRatio),
            backgroundColor: backgroundColor?.toString(),
            transform: transform?.toString(),
            borderColor: borderColor?.toString(),
            ...style,
            overflow: 'hidden',
            position: 'relative',
        } },
        React.createElement(Image, { source: placeholder?.[0], style: {
                objectFit: 'scale-down',
                ...placeholderStyle,
            }, contentPosition: { left: '50%', top: '50%' }, blurhashContentPosition: contentPosition, blurhashStyle: {
                objectFit: contentFit,
            } }),
        React.createElement(Image, { source: selectedSource, events: {
                onError: [onErrorAdapter(onError), onLoadEnd],
                onLoad: [onLoadAdapter(onLoad), handlers.onLoad, onLoadEnd],
            }, style: {
                objectFit: contentFit,
                ...imageStyle,
            }, priority: priority, contentPosition: contentPosition })));
}
//# sourceMappingURL=ExpoImage.web.js.map