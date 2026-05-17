import { useQuery } from "@tanstack/react-query";

import PublicLayout from "@/components/layout/PublicLayout";

import Reveal from "@/components/ui/reveal";

import { stockApi } from "@/lib/api";



/*

  Staggered reveal delays (ms) for each block on the page. Kept in one place

  so the cascading feel is easy to tune — increasing the step spreads the

  entrance out more dramatically, decreasing tightens it up.

*/

const REVEAL_STEP = 90;



const WholesaleTerms = () => {

  const { data: tiers = [] } = useQuery({

    queryKey: ["discount-tiers"],

    queryFn: () => stockApi.listDiscountTiers(),

  });



  return (

    <PublicLayout>

      <div className="container max-w-3xl py-8 sm:py-12">

        <Reveal delay={0} y={20}>

          <div className="eyebrow mb-3">Для бизнеса</div>

          <h1 className="font-semibold tracking-tight text-[clamp(1.5rem,4vw,2.25rem)]">

            Условия оптовых поставок

          </h1>

        </Reveal>



        <Reveal delay={REVEAL_STEP} y={20}>

          <section className="mt-10 space-y-2">

            <h2 className="text-xl font-semibold">Минимальный заказ</h2>

            <p className="text-sm text-foreground/80">

              Одна коробка любого товара. Не требуется минимум по сумме.

            </p>

          </section>

        </Reveal>



        <Reveal delay={REVEAL_STEP * 2} y={20}>

          <section className="mt-8">

            <h2 className="text-xl font-semibold">Скидки от объёма</h2>

            <p className="mt-2 text-sm text-foreground/80">

              Применяются автоматически от общего числа коробок в заявке.

            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">

              {tiers.map((t, i) => (

                // Cards reveal individually *after* the parent section so the

                // eye first catches the heading, then the tier grid cascades

                // into place.

                <Reveal

                  key={t.min_boxes}

                  delay={REVEAL_STEP * 2 + 120 + i * 70}

                  y={14}

                >

                  <div className="rounded-lg border border-border bg-surface p-4 text-center transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">

                    <div className="num text-xs text-muted-foreground">

                      от {t.min_boxes} кор.

                    </div>

                    <div className="price text-2xl text-primary">

                      −{t.discount_percent}%

                    </div>

                  </div>

                </Reveal>

              ))}

            </div>

          </section>

        </Reveal>



        <Reveal delay={REVEAL_STEP * 3} y={20}>

          <section className="mt-8">

            <h2 className="text-xl font-semibold">Оплата</h2>

            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">

              <li>Безналичный расчёт по реквизитам.</li>

              <li>

                Счёт выставляется после подтверждения наличия (в течение 2 часов в

                рабочее время).

              </li>

              <li>

                Закрывающие документы (УПД / товарная накладная) — в комплекте с

                отгрузкой.

              </li>

            </ul>

          </section>

        </Reveal>



        <Reveal delay={REVEAL_STEP * 4} y={20}>

          <section className="mt-8">

            <h2 className="text-xl font-semibold">Самовывоз</h2>

            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">

              <li>Только самовывоз со склада в Москве.</li>

              <li>

                Адрес склада и часы выдачи менеджер пришлёт вместе со счётом.

              </li>

              <li>Отгрузка за 1–2 рабочих дня после оплаты.</li>

            </ul>

          </section>

        </Reveal>



        <Reveal delay={REVEAL_STEP * 5} y={20}>

          <section className="mt-8">

            <h2 className="text-xl font-semibold">Возврат и брак</h2>

            <p className="mt-2 text-sm text-foreground/80">

              Брак фиксируется при приёмке и заменяется бесплатно. Возврат

              качественного товара возможен в течение 7 дней при условии сохранности

              упаковки.

            </p>

          </section>

        </Reveal>

      </div>

    </PublicLayout>

  );

};



export default WholesaleTerms;

