# ColumnPicker

دکمه‌ی «انتخاب ستون‌ها» با فهرست تیک‌دار؛ ستون ثابت قابل برداشتن نیست، انتخاب برای هر کاربر ذخیره می‌شود.

برای جدول‌های پهن، کنار جست‌وجو در `TableFilters extra`. با `useColumnPrefs(table, options, defaultHidden)`: ستون‌های پنهان برای هر کاربر در `localStorage` (کلید `zm.admin.table.<table>.hidden.<userId>`). `fixed` (کد، نام) همیشه دیده می‌شود؛ `soon` غیرفعال با «به‌زودی». هم‌گام شدن بین دستگاه‌ها نیازمند endpoint ترجیحات کاربر در بک‌اند است (فعلاً نیست).
