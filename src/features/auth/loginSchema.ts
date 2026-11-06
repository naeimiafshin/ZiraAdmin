import { z } from 'zod';
import { toLatinDigits } from '@/shared/lib/text';

/** قیدها دقیقاً مطابق StaffLoginInput بک‌اند: username 3..150، password ≥ 6. */
export const loginSchema = z.object({
  username: z
    .string()
    .transform((v) => toLatinDigits(v).trim())
    .pipe(
      z
        .string()
        .min(1, 'نام کاربری را وارد کنید.')
        .min(3, 'نام کاربری دست‌کم ۳ نویسه است.')
        .max(150, 'نام کاربری حداکثر ۱۵۰ نویسه است.'),
    ),
  password: z.string().min(1, 'رمز عبور را وارد کنید.').min(6, 'رمز عبور دست‌کم ۶ نویسه است.'),
});

export type LoginFormInput = z.input<typeof loginSchema>;
export type LoginFormValues = z.output<typeof loginSchema>;
