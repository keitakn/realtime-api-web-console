import type { TextAreaProps } from '@nextui-org/react';
import type { ChangeEventHandler, KeyboardEventHandler, RefObject } from 'react';
import { cn, Textarea } from '@nextui-org/react';

type Props = TextAreaProps & {
  onChange: ChangeEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  ref?: RefObject<HTMLTextAreaElement | null>;
};

export function PromptInput({ ref, classNames = {}, ...props }: Props) {
  return (
    <Textarea
      ref={ref}
      aria-label="Prompt"
      className="min-h-[40px]"
      classNames={{
        ...classNames,
        label: cn('hidden', classNames?.label),
        input: cn('py-0', classNames?.input),
      }}
      minRows={1}
      placeholder="Enter a prompt here"
      radius="lg"
      variant="bordered"
      {...props}
    />
  );
}
