import React, { JSX, useEffect, useId, useRef } from 'react';
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

/** Core factory – works for both HTML tags and React components */
const createStyled = (Component: AnyComponent): StyledFactory => {
  return (strings: TemplateStringsArray, ...values: any[]) => {
    return function StyledComponent({ className, children, style, ...props }: any) {
      const uniqueId = useId().replace(/:/g, '');
      const generatedClassName = `styled-${uniqueId}`;
      const instanceAttr = useRef(`data-styled-instance-${uniqueId.toLowerCase()}`).current;
      const rootRef = useRef<Element | null>(null);

      const evaluatedValues = values.map((val) =>
        typeof val === 'function' ? val(props) : val
      );

      const { rootClasses, nestedClasses, hasDeclaration, css: rawCss } =
        parseTemplate(strings, evaluatedValues);

      const finalClassName = twMerge(clsx(rootClasses));
      const combinedClasses = twMerge(clsx(finalClassName, className));

      useEffect(() => {
        const root = rootRef.current;

        if (!root) {
          if (nestedClasses.size > 0 && process.env.NODE_ENV !== 'production') {
            const name =
              typeof Component === 'string'
                ? Component
                : (Component as any).displayName || (Component as any).name || 'Component';
            console.warn(
              `styled(${name}): nested selectors were declared but the ref never attached to a DOM node. ` +
                `Wrap ${name} in React.forwardRef and spread the received ref + rest props onto its root ` +
                `element, or these nested styles will not apply.`
            );
          }
          return;
        }

        if (nestedClasses.size === 0) return;

        const rootSelector = `[${instanceAttr}]`;
        const perElementClasses = new Map<Element, string[]>();

        nestedClasses.forEach((classes, key) => {
          const selector = key.split('&ROOT&').join(rootSelector);

          document.querySelectorAll(selector).forEach((el) => {
            perElementClasses.set(el, [...(perElementClasses.get(el) ?? []), ...classes]);
          });
        });

        const applied = new Map<Element, string[]>();

        perElementClasses.forEach((classes, el) => {
          const merged = twMerge(clsx(classes)).split(/\s+/).filter(Boolean);
          el.classList.add(...merged);
          applied.set(el, merged);
        });

        return () => {
          applied.forEach((classes, el) => el.classList.remove(...classes));
        };
      });

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
              ref: rootRef,
              [instanceAttr]: '',
              className: `${combinedClasses} ${hasDeclaration ? generatedClassName : ''}`.trim(),
              style,
              ...props,
            },
            children
          )}
        </>
      );
    };
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