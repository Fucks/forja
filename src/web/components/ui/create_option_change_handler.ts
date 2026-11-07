export function createOptionChangeHandler<T extends string>(
    options: { value: T }[],
    onChange: (value: T) => void,
): (selectedValue: string) => void {
    return function changeToSelectedOption(selectedValue: string): void {
        const selectedOption = options.find((option) => option.value === selectedValue);
        if (selectedOption) {
            onChange(selectedOption.value);
        }
    };
}
