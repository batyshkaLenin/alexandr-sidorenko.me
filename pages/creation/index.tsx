import { NextPage } from 'next'
import Helmet from "../../components/Helmet";
import React from "react";

export const config = { amp: 'hybrid' }

const CreationPage: NextPage = () => (<>
    <Helmet title='Творчество Александра Сидоренко' description="Страница с публикациями моего творчества. Я занимаюсь музыкой, пишу стихи и рассказы.">
        <meta content='website' property='og:type' />
    </Helmet>
    <div>Страница находится в разработке</div>
</>)

export default CreationPage
