import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/shared/ui/Field";
import { changePasswordSchema, type ChangePasswordValues } from "./schemas";
import { useChangePasswordMutation } from "./useChangePasswordMutation";
import { useLogoutMutation } from "./useLogoutMutation";

export function AccountMenu() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const form = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) });
  const changePasswordMutation = useChangePasswordMutation(() => {
    form.reset();
    setChangePasswordOpen(false);
  });
  const logoutMutation = useLogoutMutation();

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Account
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
            Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={logoutMutation.isPending}
            onSelect={() => logoutMutation.mutate()}
          >
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {changePasswordOpen && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 rounded-lg border border-border bg-popover p-4 shadow-lg">
          <form
            className="grid gap-3"
            onSubmit={form.handleSubmit((v) => changePasswordMutation.mutate(v))}
          >
            <Field id="cp-current" label="Current password">
              <Input id="cp-current" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
            </Field>
            <Field id="cp-new" label="New password">
              <Input id="cp-new" type="password" autoComplete="new-password" {...form.register("newPassword")} />
            </Field>
            <Field id="cp-confirm" label="Confirm">
              <Input id="cp-confirm" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
            </Field>
            <Button type="submit" size="sm" disabled={changePasswordMutation.isPending}>
              Change password
            </Button>
            {changePasswordMutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{String((changePasswordMutation.error as Error).message)}</AlertDescription>
              </Alert>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
