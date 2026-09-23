import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  composeRenderProps,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: TabsProps) {
  return <AriaTabs {...props} className={composeRenderProps(className, (c) => cn("flex flex-col gap-2", c))} />;
}

export function TabList<T extends object>({ className, ...props }: TabListProps<T>) {
  return (
    <AriaTabList
      {...props}
      className={composeRenderProps(className, (c) => cn("inline-flex w-fit rounded-lg bg-muted p-[3px]", c))}
    />
  );
}

export function Tab({ className, ...props }: TabProps) {
  return (
    <AriaTab
      {...props}
      className={composeRenderProps(className, (c) =>
        cn(
          "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors",
          "data-[hovered]:text-foreground data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm",
          "ring-focus",
          c,
        ),
      )}
    />
  );
}

export function TabPanel({ className, ...props }: TabPanelProps) {
  return <AriaTabPanel {...props} className={composeRenderProps(className, (c) => cn("outline-none", c))} />;
}
