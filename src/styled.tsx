import React, { JSX, useCallback, useId, useLayoutEffect, useRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

type ValidElements = keyof JSX.IntrinsicElements;

type StyledComponentProps = {
  style?: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
  [key: string]: any;
};

type StyledFactory = {
  <P = Record<string, any>>(
    strings: TemplateStringsArray,
    ...values: any[]
  ): React.FC<P & StyledComponentProps>;
};

// Accept Ant Design CompoundedComponent and other complex components
type AnyComponent =
  | React.ElementType
  | React.ComponentType<any>
  | React.FC<any>
  | (new (...args: any[]) => React.Component<any>);

type Styled = {
  // callable form: styled(Button)`...`
  <C extends AnyComponent>(component: C): StyledFactory;
} & {
  // tag form: styled.div`...`
  [Tag in ValidElements]: StyledFactory;
};

export const tw = (input: TemplateStringsArray | ClassValue, ...values: any[]) => {
  if (Array.isArray(input) && 'raw' in input) {
    const combined = (input as TemplateStringsArray).reduce((acc, str, i) => {
      return acc + str + (values[i] || '');
    }, '');
    return twMerge(clsx(combined));
  }
  return twMerge(clsx(input, ...values));
};

/**
 * Selects a whole, literal class string based on a prop value, instead of
 * constructing one dynamically (e.g. `bg-${color}-500`). Tailwind's build
 * scanner works by regex-matching literal text in source files — it never
 * executes any JS — so a class name assembled at runtime from template
 * pieces is invisible to it and silently produces no CSS in production.
 *
 * The `map` argument must be written as an object literal directly in your
 * source (not built dynamically, not spread from JSON/an API response) so
 * every full class string exists as literal text for the scanner to find,
 * regardless of which branch is actually selected at runtime.
 *
 * Usage inside a styled template:
 *   ${(props) => variants(props.color, { red: 'bg-red-500', blue: 'bg-blue-500' })}
 */
export const variants = <K extends string>(
  key: K | undefined | null,
  map: Partial<Record<K, string>>,
  fallback = ''
): string => (key != null ? map[key] ?? fallback : fallback);

const VALUE_MARKER = (index: number) => `@@styled-value-${index}@@`;

/**
 * Splits a tagged template into:
 *  - rootClasses: tw()/variants() results interpolated at the top level
 *    (depth 0) — applied directly to this component's own root element.
 *  - nestedClasses: an ordered selector -> classes map for tw()/variants()
 *    results interpolated inside a `selector { ... }` block.
 *  - hasDeclaration: true only if the template contains literal CSS text
 *    (not just interpolated values) sitting directly before a `;` or `}`.
 *  - css: the literal, non-interpolated template text — unchanged.
 */
const parseTemplate = (strings: TemplateStringsArray, values: any[]) => {
  const rootClasses: string[] = [];
  const nestedClasses = new Map<string, string[]>();
  const selectorStack: string[] = [];
  let hasDeclaration = false;
  let css = '';
  let sinceLastBoundary = '';

  const combined = strings.reduce(
    (acc, str, i) => acc + str + (i < values.length ? VALUE_MARKER(i) : ''),
    ''
  );

  let i = 0;
  while (i < combined.length) {
    const markerMatch = /^@@styled-value-(\d+)@@/.exec(combined.slice(i));

    if (markerMatch) {
      const value = values[Number(markerMatch[1])];

      if (typeof value === 'string') {
        if (selectorStack.length === 0) {
          rootClasses.push(value);
        } else {
          const key = resolveSelector(selectorStack);
          nestedClasses.set(key, [...(nestedClasses.get(key) ?? []), value]);
        }
      }

      i += markerMatch[0].length;
      continue;
    }

    const char = combined[i];

    if (char === '{') {
      // text right before `{` is always a selector, never a declaration
      selectorStack.push(sinceLastBoundary.trim());
      sinceLastBoundary = '';
    } else if (char === '}') {
      if (sinceLastBoundary.trim()) hasDeclaration = true;
      selectorStack.pop();
      sinceLastBoundary = '';
    } else if (char === ';') {
      if (sinceLastBoundary.trim()) hasDeclaration = true;
      sinceLastBoundary = '';
    } else {
      sinceLastBoundary += char;
    }

    css += char;
    i += 1;
  }

  if (sinceLastBoundary.trim()) hasDeclaration = true;
  return { rootClasses, nestedClasses, hasDeclaration, css };
};

/**
 * Resolves a selector stack into a single CSS selector list, relative to
 * the root, as a cartesian product across each level's comma-separated
 * alternatives.
 */
const resolveSelector = (stack: string[]) => {
  let chains = ['&ROOT&'];

  for (const token of stack) {
    const alternatives = token.split(',').map((s) => s.trim());
    const nextChains: string[] = [];

    for (const chain of chains) {
      for (const alt of alternatives) {
        nextChains.push(alt.startsWith('&') ? chain + alt.slice(1) : `${chain} ${alt}`);
      }
    }

    chains = nextChains;
  }

  return chains.join(', ');
};

// Nested selectors already reported as invalid, so each warns only once.
const warnedSelectors = new Set<string>();

/** Core factory – works for both HTML tags and React components */
const createStyled = (Component: AnyComponent): StyledFactory => {
  return (strings: TemplateStringsArray, ...values: any[]) => {
    // forwardRef so a ref passed to the styled component (e.g. by a Dropdown or
    // Tooltip trigger) reaches the DOM node in React 18 as well as 19.
    const StyledComponent = React.forwardRef<Element, any>(function StyledComponent({ className, children, style, ...props }, forwardedRef) {
      const uniqueId = useId().replace(/:/g, '');
      const generatedClassName = `styled-${uniqueId}`;
      const instanceAttr = useRef(`data-styled-instance-${uniqueId.toLowerCase()}`).current;
      const rootRef = useRef<Element | null>(null);

      // Keep our own ref for nested selectors and still hand the node to any
      // ref passed in, rather than letting one replace the other.
      const setRootRef = useCallback((node: Element | null) => {
        rootRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }, [forwardedRef]);

      const evaluatedValues = values.map((val) =>
        typeof val === 'function' ? val(props) : val
      );

      const { rootClasses, nestedClasses, hasDeclaration, css: rawCss } =
        parseTemplate(strings, evaluatedValues);

      const finalClassName = twMerge(clsx(rootClasses));
      const combinedClasses = twMerge(clsx(finalClassName, className));

      // Content key so the effect re-applies when nested classes change —
      // props-driven values, or an edited template arriving via Fast Refresh.
      const nestedKey = JSON.stringify([...nestedClasses]);

      useLayoutEffect(() => {
        const root = rootRef.current;
      
        if (!root) {
          if (nestedClasses.size > 0 && process.env.NODE_ENV !== 'production') {
            const name =
              typeof Component === 'string'
                ? Component
                : (Component as any).displayName || (Component as any).name || 'Component';
            console.warn(
              `styled(${name}): nested selectors were declared but the ref never attached to a DOM node.`
            );
          }
          return;
        }
      
        if (nestedClasses.size === 0) return;
      
        const rootSelector = `[${instanceAttr}]`;
        const applied = new Map<Element, string[]>();
        // An element's own classes that a matching nested rule overrides (e.g. a
        // root's `translate-x-full` under `&.open { translate-x-0 }`), held off
        // the element until the rule stops matching.
        const suppressed = new Map<Element, string[]>();

        const toList = (classes: string) => classes.split(/\s+/).filter(Boolean);
      
        const applyNestedClasses = () => {
          const perElementClasses = new Map<Element, string[]>();
      
          nestedClasses.forEach((classes, key) => {
            const selector = key.split('&ROOT&').join(rootSelector);
            let matches: NodeListOf<Element>;

            // An invalid selector (e.g. one swallowing a `//` comment) is
            // skipped rather than breaking the whole component.
            try {
              matches = document.querySelectorAll(selector);
            } catch {
              if (process.env.NODE_ENV !== 'production' && !warnedSelectors.has(key)) {
                warnedSelectors.add(key);
                console.warn(
                  `styled: skipped invalid nested selector "${key.split('&ROOT&').join('&').trim()}". Templates are CSS text — keep comments above the styled call.`
                );
              }
              return;
            }

            matches.forEach((el) => {
              perElementClasses.set(el, [
                ...(perElementClasses.get(el) ?? []),
                ...classes,
              ]);
            });
          });
      
          // Drop classes on elements that no longer match, and give back any of
          // their own classes we were holding off.
          applied.forEach((classes, el) => {
            if (!perElementClasses.has(el)) {
              el.classList.remove(...classes);
              applied.delete(el);
            }
          });

          suppressed.forEach((classes, el) => {
            if (!perElementClasses.has(el)) {
              el.classList.add(...classes);
              suppressed.delete(el);
            }
          });
      
          perElementClasses.forEach((classes, el) => {
            const merged = toList(twMerge(clsx(classes)));
            const prev = applied.get(el) ?? [];
            const prevSuppressed = suppressed.get(el) ?? [];

            // The element's own classes: what is on it now that we didn't add,
            // plus what we took off. Only those that lose to a nested class are
            // suppressed, so conflicts among its own classes are left alone.
            const own = [...new Set([...Array.from(el.classList).filter((c) => !prev.includes(c)), ...prevSuppressed])];
            const ownMerged = new Set(toList(twMerge(clsx(own))));
            const winners = new Set(toList(twMerge(clsx(own, merged))));
            const overridden = own.filter((c) => ownMerged.has(c) && !winners.has(c));

            const nextSet = new Set(merged);
      
            const toRemove = prev.filter((c) => !nextSet.has(c));
            // Check the live classList, not what was applied before: React may have
            // replaced the className since, wiping classes we still think are there.
            const toAdd = merged.filter((c) => !el.classList.contains(c));
            const toRestore = prevSuppressed.filter((c) => !overridden.includes(c));
      
            if (toRemove.length) el.classList.remove(...toRemove);
            if (toRestore.length) el.classList.add(...toRestore);
            if (overridden.length) el.classList.remove(...overridden);
            if (toAdd.length) el.classList.add(...toAdd);
      
            applied.set(el, merged);

            if (overridden.length) suppressed.set(el, overridden);
            else suppressed.delete(el);
          });
        };
      
        const observer = new MutationObserver(() => {
          // Re-apply only in response to external DOM changes (e.g. React className)
          observer.disconnect();
          try {
            applyNestedClasses();
          } finally {
            observer.observe(root, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['class'],
            });
          }
        });
      
        applyNestedClasses();
      
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class'],
        });
      
        return () => {
          observer.disconnect();
          applied.forEach((classes, el) => {
            el.classList.remove(...classes);
          });
          suppressed.forEach((classes, el) => {
            el.classList.add(...classes);
          });
          applied.clear();
          suppressed.clear();
        };
      }, [instanceAttr, Component, nestedKey]);

      return (
        <>
          {hasDeclaration && (
            <style>{`
              .${generatedClassName} {
                ${rawCss}
              }
            `}</style>
          )}
          {React.createElement(
            Component as React.ElementType,
            {
              ...props,
              ref: setRootRef,
              [instanceAttr]: '',
              className: `${combinedClasses} ${hasDeclaration ? generatedClassName : ''}`.trim(),
              style,
            },
            children
          )}
        </>
      );
    });

    return StyledComponent as unknown as React.FC<any>;
  };
};

/**
 * `styled` is both:
 *   - a function  → styled(Button)`...`
 *   - an object   → styled.div`...`, styled.span`...`, etc.
 */
export const styled = new Proxy(createStyled, {
  // styled(Button)
  apply(_target, _thisArg, args: [AnyComponent]) {
    return createStyled(args[0]);
  },

  // styled.div / styled.button / …
  get(_target, prop: string) {
    return createStyled(prop as ValidElements);
  },
}) as Styled;