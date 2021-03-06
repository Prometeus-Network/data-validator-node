import React, {FunctionComponent} from "react";
import {Grid, Hidden} from "@material-ui/core";
import {AppBar} from "../AppBar";
import {Footer} from "../Footer";
import {Layout} from "../Layout";
import {NavigationMenu} from "../Navigation";
import {DataSalesHistoryContainer} from "../Transaction";
import {SelectedDataValidatorBalance} from "../Account";

export const DataSalesPage: FunctionComponent<{}> = () => (
    <Grid container>
        <Grid item xs={12}>
            <AppBar sideBarItem={<SelectedDataValidatorBalance/>}/>
        </Grid>
        <Hidden mdDown>
            <Grid item lg={2}>
                <NavigationMenu/>
            </Grid>
        </Hidden>
        <Grid item xs={12} lg={10}>
            <Layout>
                <DataSalesHistoryContainer/>
            </Layout>
        </Grid>
        <Grid item xs={12}>
            <Footer/>
        </Grid>
    </Grid>
);
