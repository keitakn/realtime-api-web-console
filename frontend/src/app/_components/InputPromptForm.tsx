'use client';

import { Icon } from '@iconify/react';
import { Button, cn, Tooltip } from '@nextui-org/react';
import { type ChangeEventHandler, type FormEvent, type KeyboardEventHandler, useRef, useState } from 'react';
import { PromptInput } from './PromptInput';

export function InputPromptForm() {
  const [prompt, setPrompt] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (textareaRef.current?.value != null && textareaRef.current?.value !== '') {
      setPrompt('');
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const submitEvent = new Event('submit', {
        bubbles: true,
        cancelable: true,
      });
      event.currentTarget.form?.dispatchEvent(submitEvent);
      event.preventDefault();
    }
  };

  const handleChangeTextarea: ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    setPrompt(event.target.value);
  };

  return (
    <form className="flex w-full items-start gap-2" onSubmit={handleSubmit}>
      <PromptInput
        onKeyDown={handleKeyDown}
        onChange={handleChangeTextarea}
        classNames={{
          innerWrapper: 'relative w-full',
          input: 'pt-1 pb-6 !pr-10 text-medium',
        }}
        ref={textareaRef}
        endContent={(
          <div className="absolute right-0 flex h-full flex-col items-end justify-between gap-2">
            <Tooltip showArrow content="Speak">
              <Button isIconOnly radius="full" size="sm" variant="light">
                <Icon className="text-default-500" icon="solar:microphone-3-linear" width={20} />
              </Button>
            </Tooltip>
            <div className="flex items-end gap-2">
              <p className="py-1 text-tiny text-default-400">
                {prompt.length}
                /2000
              </p>
              <Tooltip showArrow content="Send message">
                <Button
                  type="submit"
                  isIconOnly
                  color={!prompt ? 'default' : 'primary'}
                  isDisabled={!prompt}
                  radius="lg"
                  size="sm"
                  variant={!prompt ? 'flat' : 'solid'}
                >
                  <Icon
                    className={cn(
                      '[&>path]:stroke-[2px]',
                      !prompt ? 'text-default-600' : 'text-primary-foreground',
                    )}
                    icon="solar:arrow-up-linear"
                    width={20}
                  />
                </Button>
              </Tooltip>
            </div>
          </div>
        )}
        minRows={3}
        radius="lg"
        startContent={(
          <Tooltip showArrow content="Add Image">
            <Button isIconOnly radius="full" size="sm" variant="light">
              <Icon
                className="text-default-500"
                icon="solar:gallery-minimalistic-linear"
                width={20}
              />
            </Button>
          </Tooltip>
        )}
        value={prompt}
        onValueChange={setPrompt}
      />
    </form>
  );
}
