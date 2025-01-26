function formatNumberWithCommas(num: number): string {
  return num.toLocaleString('en-US');
}

type Props = {
  maxPromptLength: number;
};

export function InvalidPromptErrorMessage({ maxPromptLength }: Props) {
  return (
    <div className="text-xs text-red-500">
      一度に送信出来る文字数は最大
      {formatNumberWithCommas(maxPromptLength)}
      文字です。
    </div>
  );
}
