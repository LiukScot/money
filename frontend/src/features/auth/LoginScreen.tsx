import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/shared/ui/Field";
import { loginSchema, type LoginValues } from "./schemas";
import { useLoginMutation } from "./useLoginMutation";

export function LoginScreen() {
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const loginMutation = useLoginMutation(() => form.reset());

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="m-0 text-2xl font-semibold">money</h1>
          <p className="text-sm text-muted-foreground">Sign in to access your private money workspace.</p>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) => loginMutation.mutate(values))}
          >
            <Field id="login-email" label="Email">
              <Input id="login-email" type="email" autoComplete="email" {...form.register("email")} />
            </Field>
            <Field id="login-password" label="Password">
              <Input id="login-password" type="password" autoComplete="current-password" {...form.register("password")} />
            </Field>
            <Button type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
            {loginMutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{loginMutation.error instanceof Error ? loginMutation.error.message : String(loginMutation.error)}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">Signup is disabled. Use CLI provisioning.</p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
