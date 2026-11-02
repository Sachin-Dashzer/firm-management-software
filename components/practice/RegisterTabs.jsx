import Segmented from "@/components/ui/Segmented";

/**
 * The three registers that are read one after another, as one control.
 *
 * UDIN, DSC and the logins vault are the same question asked three ways —
 * what have we signed, what is about to expire, what can we get into — and
 * somebody checking one of them nearly always checks the next. Before this
 * they were three pages reached only from the left rail, in two different
 * sections.
 *
 * @param {{current: "udin"|"dsc"|"vault"}} props
 */
export default function RegisterTabs({ current }) {
  return (
    <Segmented
      label="Registers"
      value={current}
      items={[
        { key: "udin", label: "UDIN", href: "/practice/udin" },
        { key: "dsc", label: "DSC", href: "/practice/dsc" },
        { key: "vault", label: "Login vault", href: "/registers/vault" },
      ]}
    />
  );
}
