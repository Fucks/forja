export function findOptionByValue<Option extends { value: string }>(
    options: Option[],
    value: string,
): Option | undefined {
    return options.find((option) => option.value === value);
}
