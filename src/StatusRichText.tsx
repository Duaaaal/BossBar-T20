import { memo } from 'react';
import { tokenizeStatusDescription } from './shared/status';
import './status-rich-text.css';

type StatusRichTextProps = {
  text: string;
};

export const StatusRichText = memo(function StatusRichText({
  text,
}: StatusRichTextProps) {
  return (
    <>
      {tokenizeStatusDescription(text).map((token, index) => (
        token.kind
          ? <span className={`status-value is-${token.kind}`} key={`${index}-${token.text}`}>{token.text}</span>
          : token.text
      ))}
    </>
  );
});

export const StatusDamageValue = ({ children }: { children: string }) => (
  <span className="status-value is-damage">{children}</span>
);

export const StatusTurnValue = ({ children }: { children: string }) => (
  <span className="status-value is-turns">{children}</span>
);
