import { Link } from "react-router-dom";
import { useEffect } from "react";

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-2xl border border-brand-border bg-brand-card p-7 max-sm:p-5">
      {children}
    </div>
  );
}

function SectionTitle({ letter, children }: { letter: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-brand-text">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[0.8rem] font-extrabold lowercase text-brand-text">
        {letter}
      </span>
      {children}
    </h2>
  );
}

export default function Eula() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <div className="border-b border-brand-border bg-brand-card px-6 py-10 text-center">
        <p className="mb-4 text-[0.72rem] font-medium uppercase tracking-[0.24em] text-brand-muted">
          Legal
        </p>
        <h1 className="mx-auto max-w-[920px] text-3xl font-extrabold tracking-tight sm:text-4xl">
          LICENSED APPLICATION END USER LICENSE AGREEMENT
        </h1>
        <p className="mx-auto mt-3 max-w-[760px] text-sm text-brand-muted">
          Coach Kettle uses Apple&apos;s standard licensed application end user
          license agreement for App Store distribution.
        </p>
        <a
          href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-[0.78rem] text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          View on Apple.com &rarr;
        </a>
      </div>

      <div className="mx-auto max-w-[860px] px-6 pb-16 pt-12">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>

        <Section>
          <p className="mb-3 text-sm text-brand-muted">
            <strong className="text-brand-text">
              Apps made available through the App Store are licensed, not sold,
              to you.
            </strong>{" "}
            Your license to each App is subject to your prior acceptance of
            either this Licensed Application End User License Agreement
            (&quot;Standard EULA&quot;), or a custom end user license agreement
            between you and the Application Provider (&quot;Custom EULA&quot;),
            if one is provided.
          </p>
          <p className="text-sm text-brand-muted">
            Your license to any Apple App under this Standard EULA or Custom
            EULA is granted by Apple, and your license to any Third Party App
            under this Standard EULA or Custom EULA is granted by the
            Application Provider of that Third Party App. Any App that is
            subject to this Standard EULA is referred to herein as the
            &quot;Licensed Application.&quot; The Application Provider or Apple
            as applicable (&quot;Licensor&quot;) reserves all rights in and to
            the Licensed Application not expressly granted to you under this
            Standard EULA.
          </p>
        </Section>

        <Section>
          <SectionTitle letter="a">Scope of License</SectionTitle>
          <p className="text-sm text-brand-muted">
            Licensor grants to you a nontransferable license to use the
            Licensed Application on any Apple-branded products that you own or
            control and as permitted by the Usage Rules. The terms of this
            Standard EULA will govern any content, materials, or services
            accessible from or purchased within the Licensed Application as well
            as upgrades provided by Licensor that replace or supplement the
            original Licensed Application, unless such upgrade is accompanied by
            a Custom EULA. Except as provided in the Usage Rules, you may not
            distribute or make the Licensed Application available over a network
            where it could be used by multiple devices at the same time. You may
            not transfer, redistribute or sublicense the Licensed Application
            and, if you sell your Apple Device to a third party, you must remove
            the Licensed Application from the Apple Device before doing so. You
            may not copy (except as permitted by this license and the Usage
            Rules), reverse-engineer, disassemble, attempt to derive the source
            code of, modify, or create derivative works of the Licensed
            Application, any updates, or any part thereof (except as and only to
            the extent that any foregoing restriction is prohibited by applicable
            law or to the extent as may be permitted by the licensing terms
            governing use of any open-sourced components included with the
            Licensed Application).
          </p>
        </Section>

        <Section>
          <SectionTitle letter="b">Consent to Use of Data</SectionTitle>
          <p className="text-sm text-brand-muted">
            You agree that Licensor may collect and use technical data and
            related information&mdash;including but not limited to technical
            information about your device, system and application software, and
            peripherals&mdash;that is gathered periodically to facilitate the
            provision of software updates, product support, and other services to
            you (if any) related to the Licensed Application. Licensor may use
            this information, as long as it is in a form that does not personally
            identify you, to improve its products or to provide services or
            technologies to you.
          </p>
        </Section>

        <Section>
          <SectionTitle letter="c">Termination</SectionTitle>
          <p className="text-sm text-brand-muted">
            This Standard EULA is effective until terminated by you or Licensor.
            Your rights under this Standard EULA will terminate automatically if
            you fail to comply with any of its terms.
          </p>
        </Section>

        <Section>
          <SectionTitle letter="d">External Services</SectionTitle>
          <p className="text-sm text-brand-muted">
            The Licensed Application may enable access to Licensor&apos;s and/or
            third-party services and websites (collectively and individually,
            &quot;External Services&quot;). You agree to use the External
            Services at your sole risk. Licensor is not responsible for examining
            or evaluating the content or accuracy of any third-party External
            Services, and shall not be liable for any such third-party External
            Services. Data displayed by any Licensed Application or External
            Service, including but not limited to financial, medical and location
            information, is for general informational purposes only and is not
            guaranteed by Licensor or its agents. You will not use the External
            Services in any manner that is inconsistent with the terms of this
            Standard EULA or that infringes the intellectual property rights of
            Licensor or any third party. You agree not to use the External
            Services to harass, abuse, stalk, threaten or defame any person or
            entity, and that Licensor is not responsible for any such use.
            External Services may not be available in all languages or in your
            Home Country, and may not be appropriate or available for use in any
            particular location. To the extent you choose to use such External
            Services, you are solely responsible for compliance with any
            applicable laws. Licensor reserves the right to change, suspend,
            remove, disable or impose access restrictions or limits on any
            External Services at any time without notice or liability to you.
          </p>
        </Section>

        <Section>
          <SectionTitle letter="e">NO WARRANTY</SectionTitle>
          <p className="text-sm uppercase tracking-[0.015em] text-brand-muted">
            YOU EXPRESSLY ACKNOWLEDGE AND AGREE THAT USE OF THE LICENSED
            APPLICATION IS AT YOUR SOLE RISK. TO THE MAXIMUM EXTENT PERMITTED BY
            APPLICABLE LAW, THE LICENSED APPLICATION AND ANY SERVICES PERFORMED
            OR PROVIDED BY THE LICENSED APPLICATION ARE PROVIDED &quot;AS
            IS&quot; AND &quot;AS AVAILABLE,&quot; WITH ALL FAULTS AND WITHOUT
            WARRANTY OF ANY KIND, AND LICENSOR HEREBY DISCLAIMS ALL WARRANTIES
            AND CONDITIONS WITH RESPECT TO THE LICENSED APPLICATION AND ANY
            SERVICES, EITHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT
            LIMITED TO, THE IMPLIED WARRANTIES AND/OR CONDITIONS OF
            MERCHANTABILITY, OF SATISFACTORY QUALITY, OF FITNESS FOR A PARTICULAR
            PURPOSE, OF ACCURACY, OF QUIET ENJOYMENT, AND OF NONINFRINGEMENT OF
            THIRD-PARTY RIGHTS. NO ORAL OR WRITTEN INFORMATION OR ADVICE GIVEN
            BY LICENSOR OR ITS AUTHORIZED REPRESENTATIVE SHALL CREATE A WARRANTY.
            SHOULD THE LICENSED APPLICATION OR SERVICES PROVE DEFECTIVE, YOU
            ASSUME THE ENTIRE COST OF ALL NECESSARY SERVICING, REPAIR, OR
            CORRECTION. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED
            WARRANTIES OR LIMITATIONS ON APPLICABLE STATUTORY RIGHTS OF A
            CONSUMER, SO THE ABOVE EXCLUSION AND LIMITATIONS MAY NOT APPLY TO
            YOU.
          </p>
        </Section>

        <Section>
          <SectionTitle letter="f">Limitation of Liability</SectionTitle>
          <p className="text-sm text-brand-muted">
            TO THE EXTENT NOT PROHIBITED BY LAW, IN NO EVENT SHALL LICENSOR BE
            LIABLE FOR PERSONAL INJURY OR ANY INCIDENTAL, SPECIAL, INDIRECT, OR
            CONSEQUENTIAL DAMAGES WHATSOEVER, INCLUDING, WITHOUT LIMITATION,
            DAMAGES FOR LOSS OF PROFITS, LOSS OF DATA, BUSINESS INTERRUPTION, OR
            ANY OTHER COMMERCIAL DAMAGES OR LOSSES, ARISING OUT OF OR RELATED TO
            YOUR USE OF OR INABILITY TO USE THE LICENSED APPLICATION, HOWEVER
            CAUSED, REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, OR
            OTHERWISE) AND EVEN IF LICENSOR HAS BEEN ADVISED OF THE POSSIBILITY
            OF SUCH DAMAGES. SOME JURISDICTIONS DO NOT ALLOW THE LIMITATION OF
            LIABILITY FOR PERSONAL INJURY, OR OF INCIDENTAL OR CONSEQUENTIAL
            DAMAGES, SO THIS LIMITATION MAY NOT APPLY TO YOU. In no event shall
            Licensor&apos;s total liability to you for all damages (other than as
            may be required by applicable law in cases involving personal injury)
            exceed the amount of fifty dollars ($50.00). The foregoing
            limitations will apply even if the above stated remedy fails of its
            essential purpose.
          </p>
        </Section>

        <Section>
          <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-brand-text">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[0.8rem] font-extrabold lowercase text-brand-text">
              g
            </span>
          </h2>
          <p className="text-sm text-brand-muted">
            You may not use or otherwise export or re-export the Licensed
            Application except as authorized by United States law and the laws of
            the jurisdiction in which the Licensed Application was obtained. In
            particular, but without limitation, the Licensed Application may not
            be exported or re-exported (a) into any U.S.-embargoed countries or
            (b) to anyone on the U.S. Treasury Department&apos;s Specially
            Designated Nationals List or the U.S. Department of Commerce Denied
            Persons List or Entity List. By using the Licensed Application, you
            represent and warrant that you are not located in any such country or
            on any such list. You also agree that you will not use these products
            for any purposes prohibited by United States law, including, without
            limitation, the development, design, manufacture, or production of
            nuclear, missile, or chemical or biological weapons.
          </p>
        </Section>

        <Section>
          <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-brand-text">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[0.8rem] font-extrabold lowercase text-brand-text">
              h
            </span>
          </h2>
          <p className="text-sm text-brand-muted">
            The Licensed Application and related documentation are
            &quot;Commercial Items&quot;, as that term is defined at 48 C.F.R.
            &sect;2.101, consisting of &quot;Commercial Computer Software&quot;
            and &quot;Commercial Computer Software Documentation&quot;, as such
            terms are used in 48 C.F.R. &sect;12.212 or 48 C.F.R.
            &sect;227.7202, as applicable. Consistent with 48 C.F.R.
            &sect;12.212 or 48 C.F.R. &sect;227.7202-1 through 227.7202-4, as
            applicable, the Commercial Computer Software and Commercial Computer
            Software Documentation are being licensed to U.S. Government end
            users (a) only as Commercial Items and (b) with only those rights as
            are granted to all other end users pursuant to the terms and
            conditions herein. Unpublished-rights reserved under the copyright
            laws of the United States.
          </p>
        </Section>

        <Section>
          <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-brand-text">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[0.8rem] font-extrabold lowercase text-brand-text">
              i
            </span>
          </h2>
          <p className="mb-3 text-sm text-brand-muted">
            Except to the extent expressly provided in the following paragraph,
            this Agreement and the relationship between you and Apple shall be
            governed by the laws of the State of California, excluding its
            conflicts of law provisions. You and Apple agree to submit to the
            personal and exclusive jurisdiction of the courts located within the
            county of Santa Clara, California, to resolve any dispute or claim
            arising from this Agreement. If (a) you are not a U.S. citizen; (b)
            you do not reside in the U.S.; (c) you are not accessing the Service
            from the U.S.; and (d) you are a citizen of one of the countries
            identified below, you hereby agree that any dispute or claim arising
            from this Agreement shall be governed by the applicable law set forth
            below, without regard to any conflict of law provisions, and you
            hereby irrevocably submit to the non-exclusive jurisdiction of the
            courts located in the state, province or country identified below
            whose law governs:
          </p>
          <p className="mb-3 text-sm text-brand-muted">
            If you are a citizen of any European Union country or Switzerland,
            Norway or Iceland, the governing law and forum shall be the laws and
            courts of your usual place of residence.
          </p>
          <p className="text-sm text-brand-muted">
            Specifically excluded from application to this Agreement is that law
            known as the United Nations Convention on the International Sale of
            Goods.
          </p>
        </Section>

        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>
      </div>
    </>
  );
}
