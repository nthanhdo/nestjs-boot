# [Tuần X]: [Tên chủ đề]

> **Giai đoạn:** Stage X — [Tên stage]
> **Buổi:** X/16 | **Thời lượng:** 90 phút (60' lý thuyết + 30' thực hành)
> **Yêu cầu:** Đã hoàn thành Tuần X-1

---

## Mục tiêu buổi học

Sau buổi này, học viên sẽ có thể:

1. [ ] _Mục tiêu 1 — dùng động từ đo lường được: giải thích, implement, phân biệt, debug..._
2. [ ] _Mục tiêu 2_
3. [ ] _Mục tiêu 3_
4. [ ] _Mục tiêu 4_

---

## Cấu trúc buổi học

| Thời gian | Phần | Nội dung |
|-----------|------|----------|
| 0:00–0:10 | Warm-up | Ôn bài tuần trước + kiểm tra bài tập |
| 0:10–0:25 | Lý thuyết 1 | _Khái niệm cốt lõi — WHY trước_ |
| 0:25–0:40 | Lý thuyết 2 | _Đi sâu — HOW, với code demo live_ |
| 0:40–0:55 | Lý thuyết 3 | _Pattern thực tế từ nestjs-boot source_ |
| 0:55–1:00 | Nghỉ 5 phút | — |
| 1:00–1:25 | Thực hành | _Coding exercise có hướng dẫn_ |
| 1:25–1:30 | Wrap-up | Tóm tắt + giao bài tập + preview tuần sau |

---

## PHẦN 1: LÝ THUYẾT (60 phút)

### 1.1 Warm-up — Ôn tập & Kiểm tra (10 phút)

**Quiz nhanh** (3 câu, trả lời miệng hoặc chat):

1. _Câu hỏi liên quan tuần trước — verify học viên nhớ_
2. _Câu hỏi nối kiến thức cũ → bài hôm nay_
3. _Câu hỏi mở — "theo bạn thì..." để kích hoạt tư duy_

**Review bài tập:**
- Show 1 bài nộp tốt (highlight điểm hay, không nêu tên nếu chưa xin phép)
- Show 1 lỗi phổ biến (anonymous) → sửa cùng lớp

---

### 1.2 Khái niệm cốt lõi — Tại sao cần [chủ đề]? (15 phút)

> **Nguyên tắc:** Luôn bắt đầu bằng VẤN ĐỀ, không phải giải pháp.
> Học viên phải CẢM THẤY pain point trước khi thấy giải pháp.

**Vấn đề thực tế:**

_Mô tả 1 tình huống thực tế mà học viên có thể hình dung. Dùng analogy đời thường._

> Ví dụ: "Tưởng tượng bạn làm quản lý thư viện. 100 người cùng mượn sách lúc 8h sáng. Nếu chỉ có 1 cuốn sổ ghi tay..."

**Demo vấn đề (live code):**

```typescript
// Code KHÔNG có [chủ đề] — show nó fail thế nào
// Giảng viên code live, để lỗi xảy ra trước mặt học viên
```

_Kết quả: học viên thấy crash / lỗi / performance issue → "Vậy phải làm sao?"_

**Giải pháp:**

_Giới thiệu concept ở mức high-level. Chưa vào code. Dùng diagram hoặc hình vẽ._

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Component│────▶│ Component│────▶│ Component│
│    A     │     │    B     │     │    C     │
└──────────┘     └──────────┘     └──────────┘
```

**Checklist hiểu concept:**
- [ ] Học viên trả lời được: "[Chủ đề] giải quyết vấn đề gì?"
- [ ] Học viên nêu được 1 ví dụ thực tế ngoài ví dụ giảng viên đưa

---

### 1.3 Đi sâu — Cách hoạt động (15 phút)

> **Nguyên tắc:** Code demo PHẢI chạy được. Không show code trên slide không chạy.

**Concept 1: [Tên]**

_Giải thích cách hoạt động, step by step._

```typescript
// Code example — giảng viên gõ live, KHÔNG copy-paste
// Mỗi block code ≤ 15 dòng — đủ nhỏ để học viên theo kịp
```

_Giải thích từng dòng quan trọng. Không giải thích dòng hiển nhiên._

**Concept 2: [Tên]**

```typescript
// Code example tiếp theo, build trên code trước
```

**So sánh:**

| Không dùng [chủ đề] | Có dùng [chủ đề] |
|---------------------|------------------|
| _Hậu quả 1_ | _Lợi ích 1_ |
| _Hậu quả 2_ | _Lợi ích 2_ |

---

### 1.4 Pattern từ nestjs-boot (15 phút)

> **Nguyên tắc:** Đọc production code thật. Show file path + giải thích.

**File:** `src/[module]/[file].ts`

```typescript
// Trích đoạn từ nestjs-boot source
// Highlight phần liên quan bài học
// Giải thích: "Đây là cách production code làm. Bạn thấy pattern XYZ ở đây..."
```

**Tại sao code viết như vậy?**
- _Quyết định thiết kế 1: ..._
- _Quyết định thiết kế 2: ..._
- _Trade-off: ..._

**Lỗi thường gặp:**

| Lỗi | Triệu chứng | Nguyên nhân | Cách fix |
|-----|-------------|-------------|----------|
| _Lỗi 1_ | _Error message_ | _Tại sao_ | _Làm gì_ |
| _Lỗi 2_ | _Error message_ | _Tại sao_ | _Làm gì_ |
| _Lỗi 3_ | _Error message_ | _Tại sao_ | _Làm gì_ |

---

### Nghỉ 5 phút ☕

---

## PHẦN 2: THỰC HÀNH (25 phút)

> **Nguyên tắc:** Bài tập phải hoàn thành được trong 25 phút.
> Nếu học viên nhanh → có phần bonus. Nếu chậm → có gợi ý từng bước.

### Đề bài

_Mô tả ngắn gọn task cần làm. Kết quả kỳ vọng rõ ràng._

**Input:** _Cái gì đã có sẵn (starter code, project từ tuần trước)_
**Output:** _Cái gì phải hoạt động khi xong_

### Hướng dẫn từng bước

**Bước 1: [Tên bước]** (5 phút)

```bash
# Lệnh cần chạy
```

```typescript
// Code cần viết
```

_Kiểm tra: chạy `[command]` → thấy `[kết quả]` là đúng_

**Bước 2: [Tên bước]** (10 phút)

```typescript
// Code cần viết — phần chính của bài
```

_Kiểm tra: ..._

**Bước 3: [Tên bước]** (10 phút)

```typescript
// Code cần viết — test hoặc verify
```

_Kiểm tra: ..._

### Verify kết quả

```bash
# Lệnh verify — học viên chạy để tự kiểm tra
curl http://localhost:3000/... # Expected: ...
npm test                       # Expected: X tests passing
```

### Bonus (nếu xong sớm)

_Task nâng cao cho học viên nhanh. Không bắt buộc._

---

## PHẦN 3: WRAP-UP (5 phút)

### Tóm tắt 3 điểm chính

1. **[Điểm 1]** — _1 câu tóm tắt_
2. **[Điểm 2]** — _1 câu tóm tắt_
3. **[Điểm 3]** — _1 câu tóm tắt_

### Bài tập về nhà

> **Deadline:** Trước buổi học tuần sau
> **Nộp:** Push lên GitHub repo cá nhân, tạo PR vào repo lớp

**Bài bắt buộc:**
- [ ] _Task 1 — build trên code thực hành trong buổi_
- [ ] _Task 2 — thêm feature mới_
- [ ] _Task 3 — viết test_

**Bài bonus (cộng điểm):**
- [ ] _Task nâng cao_

**Tiêu chí chấm:**

| Tiêu chí | Điểm | Yêu cầu |
|----------|------|---------|
| Hoàn thành đúng yêu cầu | 60 | Code chạy được, kết quả đúng |
| Code quality | 20 | Đặt tên rõ, không duplicate, có types |
| Test | 20 | ≥2 test cases (happy path + error case) |
| **Bonus** | +10 | Bài bonus |

### Preview tuần sau

> Tuần tới chúng ta sẽ học **[Tên chủ đề]**. Để chuẩn bị, hãy:
> - Đọc trước: _[link hoặc tên tài liệu]_
> - Cài đặt trước: _[tool/package nếu cần]_

---

## Câu hỏi tự kiểm tra

_Học viên tự trả lời sau buổi học. Không nộp, để tự đánh giá._

1. _Câu hỏi conceptual — "Giải thích bằng lời của bạn..."_
2. _Câu hỏi so sánh — "Sự khác nhau giữa X và Y là gì?"_
3. _Câu hỏi tình huống — "Nếu gặp lỗi Z, bạn sẽ debug thế nào?"_
4. _Câu hỏi thiết kế — "Nếu phải thiết kế X, bạn sẽ chọn approach nào? Tại sao?"_

---

## Đọc thêm

- _[Tài liệu chính thức]_
- _[Blog post / Video liên quan]_
- _[Source code nestjs-boot: `src/[module]/`]_

---

<!--
GHI CHÚ CHO GIẢNG VIÊN (không show cho học viên):

Chuẩn bị trước buổi:
- [ ] Chạy thử toàn bộ code examples — verify đúng version
- [ ] Chuẩn bị starter code cho phần thực hành
- [ ] Check homework tuần trước, chọn 1 bài tốt + 1 lỗi phổ biến
- [ ] Test kết nối (nếu online): screen share, audio

Lưu ý khi dạy:
- Gõ code CHẬM — học viên cần thời gian đọc
- Hỏi "có ai thắc mắc không?" sau MỖI concept, không phải cuối buổi
- Nếu 1 câu hỏi mất >3 phút → note lại, trả lời sau buổi
- Dừng code nếu >30% lớp chưa theo kịp (hỏi show of hands)

Timing backup plan:
- Nếu lý thuyết dài → cắt bonus trong thực hành
- Nếu thực hành kẹt → show solution, giải thích, giao về nhà
- KHÔNG BAO GIỜ skip wrap-up — tóm tắt + bài tập quan trọng hơn 5 phút code thêm
-->
